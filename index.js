/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const dedent = require("dedent");
const fs = require("fs");
const path = require("path");
const sql = require("mssql");
require("dotenv").config();

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

    let pr_number = context.payload.pull_request.number;
    let pr_author = context.payload.pull_request.user.login;
    let organization_name = context.payload.repository.owner.login;
    let pr_body = context.payload.pull_request.body;
    let detectedLanguage = "en";

    appInsights.trackEvent({
      name: "Pull Request Close Payload",
      properties: {
        pr_number: pr_number,
        pr_author: pr_author,
      
      },
    });

    // check language for pr_body
    if (LANGUAGE_API_ENDPOINT && LANGUAGE_API_KEY) {
      const TAclient = new TextAnalysisClient(
        LANGUAGE_API_ENDPOINT,
        new AzureKeyCredential(LANGUAGE_API_KEY)
      );
      if (pr_body) {
        try {
          let startTime = Date.now();
          let result = await TAclient.analyze("LanguageDetection", [pr_body]);
          let duration = Date.now() - startTime;
          appInsights.trackDependency({
            target: "API:Language Detection",
            name: "detect pull request description language",
            duration: duration,
            resultCode: 200,
            success: true,
            dependencyTypeName: "HTTP",
          });
          if (result.length > 0 && !result[0].error && ["en", "es", "pt", "fr"].includes(result[0].primaryLanguage.iso6391Name) ) {
            detectedLanguage = result[0].primaryLanguage.iso6391Name;
          }else {
            detectedLanguage = "en";
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
      detectedLanguage +
        ".md",
      "utf-8"
    );

    // find XXX in file and replace with pr_number
    let fileContent = dedent(
      issue_body.replace(/XXX/g, "#" + pr_number.toString())
    );

    // display the body for the issue
    app.log.info(fileContent);
    
    // create an issue using fileContent as body if pr_author is included in copilotSeats
    try {
      await context.octokit.issues.create({
        owner: organization_name,
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
        properties: {
          issue_number: context.payload.issue.number
        },
      });
      await GetSurveyData(context);
    }
  });

  app.on("issue_comment.created", async (context) => {
    if (context.payload.issue.title.startsWith("Copilot Usage - PR#")) {
      appInsights.trackEvent({
        name: "Issue Comment Created Payload",
        properties: {
          issue_number: context.payload.issue.number,
          comment: context.payload.comment,
        },
      });
      await GetSurveyData(context);
    }
  });

  async function GetSurveyData(context) {
    let issue_body = context.payload.issue.body;
    let issue_id = context.payload.issue.id;

    // save comment body if present
    let comment = null;
    if(context.payload.comment) {
      comment = context.payload.comment.body;
    }

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

    // if there's a comment, insert it into the DB regardless of whether the user answered the survey or not
    if (comment) {
      let startTime = Date.now();
      let insertResult = await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null, null, comment);
      let duration = Date.now() - startTime;
      appInsights.trackDependency({
        target: "DB:copilotUsage",
        name: "insert when comment is present",
        data: insertResult.query,
        duration: duration,
        resultCode: insertResult.status ? 200 : 500,
        success: insertResult.status,
        dependencyTypeName: "SQL",
      });
    }

    if (isCopilotUsed) {
      let startTime = Date.now();
      let insertResult = await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null, null, comment);
      let duration = Date.now() - startTime;
      appInsights.trackDependency({
        target: "DB:copilotUsage",
        name: "insert when Yes is selected",
        data: insertResult.query,
        duration: duration,
        resultCode: insertResult.status ? 200 : 500,
        success: insertResult.status,
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
        //if percentage is selected, insert into DB
        let startTime = Date.now();
        let insertResult = await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, pctValue, null, comment);
        let duration = Date.now() - startTime;
        appInsights.trackDependency({
          target: "DB:copilotUsage",
          name: "insert when pct is selected",
          data: insertResult.query,
          duration: duration,
          resultCode: insertResult.status ? 200 : 500,
          success: insertResult.status,
          dependencyTypeName: "SQL",
        });
      }

      // loop through checkboxes and find the ones that do not contain % and are not Yes or No
      let freqSelected = false;
      let freqValue = new Array();
      for (const checkbox of checkboxes) {
        if (
          !checkbox.includes("%") &&
          !checkbox.includes("Sim") &&
          !checkbox.includes("Si") &&
          !checkbox.includes("Yes") &&
          !checkbox.includes("Oui") &&
          !checkbox.includes("Não") &&
          !checkbox.includes("No") &&
          !checkbox.includes("Non")
        ) {
          freqSelected = true;
          frequencyValue = checkbox;
          frequencyValue = frequencyValue.replace(/\[x\] /g, "");
          freqValue.push(frequencyValue);
          app.log.info(frequencyValue);
        }
      }

      if (freqSelected) {
        //if frequency is selected, insert into DB
        let startTime = Date.now();
        let insertResult = await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null, freqValue, comment);
        let duration = Date.now() - startTime;
        appInsights.trackDependency({
          target: "DB:copilotUsage",
          name: "insert when freq is selected",
          data: insertResult.query,
          duration: duration,
          resultCode: insertResult.status ? 200 : 500,
          success: insertResult.status,
          dependencyTypeName: "SQL",
        });
      }

      if( pctSelected && freqSelected ){
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
        let insertResult = await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null, null, comment);
        let duration = Date.now() - startTime;
        appInsights.trackDependency({
          target: "DB:copilotUsage",
          name: "insert when No is selected",
          data: insertResult.query,
          duration: duration,
          resultCode: insertResult.status ? 200 : 500,
          success: insertResult.status,
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
    pctValue,
    freqValue,
    comment
  ) {

    let conn = null;
    let query = null;
    let status = true;

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
          record_ID INT IDENTITY(1,1),  
          enterprise_name VARCHAR(50),
          organization_name VARCHAR(50),
          repository_name VARCHAR(50),
          issue_id BIGINT,
          issue_number INT,
          PR_number INT,
          assignee_name VARCHAR(50),
          is_copilot_used BIT,
          saving_percentage VARCHAR(25),
          usage_frequency VARCHAR(50),
          comment VARCHAR(255),
          created_at DATETIME,
          completed_at DATETIME
      );
      `;
      }

      let result =
        await sql.query`SELECT * FROM SurveyResults WHERE Issue_id = ${issue_id}`;
      app.log.info("Database has been created and issue id existence has been confirmed");

      // convert pctValue to string
      if (pctValue) {
        pctValue = pctValue.toString();
      }
      // convert freqValue to string
      if (freqValue) {
        freqValue = freqValue.toString();
      }

      let assignee_name = null;
      if (context.payload.issue.assignee) {
        assignee_name = context.payload.issue.assignee.login;
      }

      if (result.recordset.length > 0) {
        // create query
        let update_query = `UPDATE [SurveyResults] SET [is_copilot_used] = ${isCopilotUsed? 1 : 0}, [completed_at] = '${context.payload.issue.updated_at}'`;
        if (assignee_name) {
          update_query += `, [assignee_name] = '${assignee_name}'`;
        }
        if (pctValue) {
          update_query += `, [saving_percentage] = '${pctValue}'`;
        }
        if (freqValue) {
          update_query += `, [usage_frequency] = '${freqValue}'`;
        }
        if (comment) {
          update_query += `, [comment] = '${comment}'`;
        }
        update_query += ` WHERE [issue_id] = ${issue_id}`;

        // update existing record
        let update_result = await sql.query(update_query);
        app.log.info(update_result);
      } else {
        // check if dynamic values are present in context.payload
        let enterprise_name = null;
        let organization_name = null;
        if (context.payload.enterprise) {
          enterprise_name = context.payload.enterprise.name;
        }
        if(context.payload.organization){
          organization_name = context.payload.organization.login;
        }
        if(context.payload.organization){
          organization_name = context.payload.organization.login;
        }
        let insert_query = `INSERT INTO SurveyResults (
            enterprise_name,
            organization_name,
            repository_name,
            issue_id,
            issue_number,
            PR_number,
            assignee_name,
            is_copilot_used,
            saving_percentage,
            usage_frequency,
            comment,
            created_at,
            completed_at
          )
          VALUES (
            '${enterprise_name}',
            '${organization_name}',
            '${context.payload.repository.name}',
             ${issue_id},
             ${context.payload.issue.number},
             ${pr_number},
            '${assignee_name}',
            '${isCopilotUsed}',
            '${pctValue}',
            '${freqValue}',
            '${comment}',
            '${context.payload.issue.created_at}',
            '${context.payload.issue.updated_at}'
          )`;
        let insert_result = await sql.query(insert_query);
        app.log.info(insert_result);
      }
    } catch (err) {
      app.log.error(err);
      appInsights.trackException({ exception: err });
      status = false;
    } finally {
      if (conn) {
        conn.close();
      }
      return {
        query: query,
        status: status
      };
      }
    }
  };

// Define class for app insights. If no instrumentation key is provided, then no app insights will be used.
class AppInsights {
  constructor() {
    if (process.env.APPLICATIONINSIGHTS_CONNECTION_STRING) {
      this.appInsights = require("applicationinsights");
      this.appInsights.setup().start();
      this.appIClient = this.appInsights.defaultClient;
    } else {
      this.appIClient = null;
    }
  }
  trackEvent(event) {
    if (this.appIClient) {
      this.appIClient.trackEvent(event);
    }
  }
  trackDependency( dependency ) {
    if (this.appIClient) {
      this.appIClient.trackDependency(dependency);
    }
  }
  trackException(exception) {
    if (this.appIClient) {
      this.appIClient.trackException(exception);
    }
  }
}