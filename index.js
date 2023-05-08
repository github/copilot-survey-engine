/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const dedent = require("dedent");
const fs = require("fs");
const path = require("path");
const sql = require("mssql");
require("dotenv").config();
let comment = null;

const {
  TextAnalysisClient,
  AzureKeyCredential,
} = require("@azure/ai-language-text");
const { LANGUAGE_API_KEY, LANGUAGE_API_ENDPOINT, DATABASE_CONNECTION_STRING } =
  process.env;

module.exports = (app) => {
  // Your code here
  app.log.info("Yay, the app was loaded!");

  let appInsights = new AppInsights();

  app.on("pull_request.closed", async (context) => {
    appInsights.trackEvent({
      name: "Pull Request Close Payload",
      properties: context.payload,
    });
    let pr_number = context.payload.pull_request.number;
    let pr_body = context.payload.pull_request.body;
    let result = [{ primaryLanguage: { iso6391Name: "en" } }];

    // check language for pr_body
    if (LANGUAGE_API_ENDPOINT && LANGUAGE_API_KEY) {
      const TAclient = new TextAnalysisClient(
        LANGUAGE_API_ENDPOINT,
        new AzureKeyCredential(LANGUAGE_API_KEY)
      );
      if (pr_body) {
        try {
          let startTime = Date.now();
          result = await TAclient.analyze("LanguageDetection", [pr_body]);
          let duration = Date.now() - startTime;
          appInsights.trackDependency({
            target: "API:Language Detection",
            name: "get pull request language",
            duration: duration,
            resultCode: 0,
            success: true,
            dependencyTypeName: "HTTP",
          });
          if (
            !["en", "es", "pt", "fr"].includes(
              result[0].primaryLanguage.iso6391Name
            )
          ) {
            result[0].primaryLanguage.iso6391Name = "en";
          }
        } catch (err) {
          app.log.error(err);
          appInsights.trackException({ exception: err });
        }
      }
    }

    // read file that aligns with detected language
    const issue_body = fs.readFileSync(
      "./issue_template/copilot-usage-" +
        result[0].primaryLanguage.iso6391Name +
        ".md",
      "utf-8"
    );

    // find XXX in file and replace with pr_number
    let fileContent = dedent(
      issue_body.replace(/XXX/g, "#" + pr_number.toString())
    );

    // display the body for the issue
    app.log.info(fileContent);

    // create an issue using fileContent as body
    try {
      await context.octokit.issues.create({
        owner: context.payload.repository.owner.login,
        repo: context.payload.repository.name,
        title: "Copilot Usage - PR#" + pr_number.toString(),
        body: fileContent,
        assignee: context.payload.pull_request.user.login,
      });
    } catch (err) {
      app.log.error(err);
      appInsights.trackException({ exception: err });
    }
  });

  app.on("issues.edited", async (context) => {
    if (context.payload.issue.title.startsWith("Copilot Usage - PR#")) {
      appInsights.trackEvent({
        name: "Issue Edited Payload",
        properties: context.payload,
      });
      await GetSurveyData(context);
    }
  });

  app.on("issue_comment.created", async (context) => {
    if (context.payload.issue.title.startsWith("Copilot Usage - PR#")) {
      appInsights.trackEvent({
        name: "Issue Comment Created Payload",
        properties: context.payload,
      });
      comment = context.payload.comment.body;
      await GetSurveyData(context);
      comment = null;
    }
  });

  async function GetSurveyData(context) {
    let issue_body = context.payload.issue.body;
    let issue_id = context.payload.issue.id;

    // find regex [0-9]\+ in issue_body and get first result
    let pr_number = issue_body.match(/[0-9]+/)[0];

    // find regex \[x\] in issue_body and get complete line in an array
    let checkboxes = issue_body.match(/\[x\].*/g);

    // find if checkboxes array contains Sim o Si or Yes
    let isCopilotUsed = checkboxes.some((checkbox) => {
      return (
        checkbox.includes("Sim") ||
        checkbox.includes("Si") ||
        checkbox.includes("Yes") ||
        checkbox.includes("Oui")
      );
    });

    if (comment) {
      let startTime = Date.now();
      await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null);
      let duration = Date.now() - startTime;
      appInsights.trackDependency({
        target: "DB:copilotUsage",
        name: "insert when comment is present",
        duration: duration,
        resultCode: 0,
        success: true,
        dependencyTypeName: "SQL",
      });
    }

    if (isCopilotUsed) {
      let startTime = Date.now();
      await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null);
      let duration = Date.now() - startTime;
      appInsights.trackDependency({
        target: "DB:copilotUsage",
        name: "insert when Yes is selected",
        duration: duration,
        resultCode: 0,
        success: true,
        dependencyTypeName: "SQL",
      });

      // loop through checkboxes and find the one that contains %
      let pctSelected = false;
      let pctValue = new Array();
      for (const checkbox of checkboxes) {
        if (checkbox.includes("%")) {
          pctSelected = true;
          copilotPercentage = checkbox;
          copilotPercentage = copilotPercentage.replace(/\[x\] /g, "");
          pctValue.push(copilotPercentage);
          app.log.info(copilotPercentage);
        }
      }
      if (pctSelected) {
        // save into sql atabase with connstring

        let startTime = Date.now();
        await insertIntoDB(
          context,
          issue_id,
          pr_number,
          isCopilotUsed,
          pctValue
        );
        let duration = Date.now() - startTime;
        appInsights.trackDependency({
          target: "DB:copilotUsage",
          name: "insert when pct is selected",
          duration: duration,
          resultCode: 0,
          success: true,
          dependencyTypeName: "SQL",
        });

        // close the issue
        try {
          await context.octokit.issues.update({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            state: "closed",
          });
        } catch (err) {
          app.log.error(err);
          appInsights.trackException({ exception: err });
        }
      }
    } else {
      if (
        checkboxes.some((checkbox) => {
          return (
            checkbox.includes("Não") ||
            checkbox.includes("No") ||
            checkbox.includes("Non")
          );
        })
      ) {
        let startTime = Date.now();
        await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null);
        let duration = Date.now() - startTime;
        appInsights.trackDependency({
          target: "DB:copilotUsage",
          name: "insert when No is selected",
          duration: duration,
          resultCode: 0,
          success: true,
          dependencyTypeName: "SQL",
        });

        if (comment) {
          try {
            // close the issue
            await context.octokit.issues.update({
              owner: context.payload.repository.owner.login,
              repo: context.payload.repository.name,
              issue_number: context.payload.issue.number,
              state: "closed",
            });
          } catch (err) {
            app.log.error(err);
            appInsights.trackException({ exception: err });
          }
        }
      }
    }
  }

  async function insertIntoDB(
    context,
    issue_id,
    pr_number,
    isCopilotUsed,
    pctValue
  ) {
    let conn = null;
    try {
      conn = await sql.connect(DATABASE_CONNECTION_STRING);

      // Check if table exists
      let tableCheckResult = await sql.query`
      SELECT *
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME = 'SurveyResults'
    `;

      if (tableCheckResult.recordset.length === 0) {
        // Create table if it doesn't exist
        await sql.query`
        CREATE TABLE SurveyResults (
          id INT IDENTITY(1,1) PRIMARY KEY,
          issue_id INT NOT NULL,
          PR_number INT,
          Value_detected BIT,
          Value_percentage VARCHAR(50),
          Value_ndetected_reason VARCHAR(MAX),
          completed_at DATETIME,
          enterprise_name VARCHAR(50),
          assignee_name VARCHAR(50)
        )
      `;
      }

      let result =
        await sql.query`SELECT * FROM SurveyResults WHERE issue_id = ${issue_id}`;
      console.log("here again");

      // convert pctValue to string
      if (pctValue) {
        pctValue = pctValue.toString();
      }

      if (result.recordset.length > 0) {
        // update existing record
        let update_result =
          await sql.query`UPDATE SurveyResults SET PR_number = ${pr_number}, Value_detected = ${isCopilotUsed}, Value_percentage = ${pctValue}, Value_ndetected_reason = ${comment}, 	completed_at = ${context.payload.issue.updated_at} WHERE issue_id = ${issue_id}`;
        app.log.info(update_result);
      } else {
        // check if enterprise is present in context.payload
        let enterprise_name = null;
        let assignee_name = null;
        if (context.payload.enterprise) {
          enterprise_name = context.payload.enterprise.name;
        }
        if (context.payload.issue.assignee) {
          assignee_name = context.payload.issue.assignee.login;
        }

        let insert_result = await sql.query`
          INSERT INTO SurveyResults (
            issue_id,
            PR_number,
            Value_detected,
            Value_percentage,
            Value_ndetected_reason,
            completed_at,
            enterprise_name,
            assignee_name
          )
          VALUES (
            ${issue_id},
            ${pr_number},
            ${isCopilotUsed},
            ${pctValue},
            ${comment},
            ${context.payload.issue.updated_at},
            ${enterprise_name},
            ${assignee_name}
          )
      `;
        app.log.info(insert_result);
      }
    } catch (err) {
      app.log.error(err);
      appInsights.trackException({ exception: err });
    } finally {
      if (conn) {
        conn.close();
      }
    }
  }

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};

// Define class for app insights. If no instrumentation key is provided, then no app insights will be used.
class AppInsights {
  constructor() {
    if (process.env.APPINSIGHTS_INSTRUMENTATIONKEY) {
      this.appInsights = require("applicationinsights");
      this.appInsights.setup().start();
      this.appIClient = this.appInsights.defaultClient;
    } else {
      this.appIClient = null;
    }
  }
  trackEvent(name, properties) {
    if (this.appIClient) {
      this.appIClient.trackEvent({ name: name, properties: properties });
    }
  }
  trackDependency(
    target,
    name,
    duration,
    resultCode,
    success,
    dependencyTypeName
  ) {
    if (this.appIClient) {
      this.appIClient.trackDependency({
        target: target,
        name: name,
        duration: duration,
        resultCode: resultCode,
        success: success,
        dependencyTypeName: dependencyTypeName,
      });
    }
  }
  trackException(exception) {
    if (this.appIClient) {
      this.appIClient.trackException({ exception: exception });
    }
  }
}
