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
const { LANGUAGE_API_KEY, LANGUAGE_API_ENDPOINT, DATABASE_CONNECTION_STRING, VALIDATE_SEAT_ASSIGNMENT, APPLICATIONINSIGHTS_CONNECTION_STRING } =
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
    
    // create an issue using fileContent as body if pr_author is included in copilotSeats using Copilot Seat Billing api
    let copilotSeatUsers = [];
    if (VALIDATE_SEAT_ASSIGNMENT == "YES") {
      let copilotSeats = await context.octokit.request(
        "GET /orgs/{org}/copilot/billing/seats",
        {
          org: organization_name,
          headers: {
            'X-GitHub-Api-Version': '2022-11-28'
          }
        }
      );
      copilotSeatUsers = copilotSeats.data.seats;
    }

    if ( VALIDATE_SEAT_ASSIGNMENT != "YES" || (VALIDATE_SEAT_ASSIGNMENT == "YES" && copilotSeatUsers.some(user => user.assignee.login == pr_author))) {
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
      await insertIntoDB(context);
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
      await insertIntoDB(context);
    }
  });

  async function GetSurveyData(context) {
    let issue_body = context.payload.issue.body;

    // save comment body if present
    let comment = null;
    if(context.payload.comment) {
      comment = context.payload.comment.body.replace(/\n/g, ' ').trim();
    }

    // find regex [0-9]\+ in issue_body and get first result
    let pr_number = issue_body.match(/[0-9]+/)[0];

    // Get answers to first question and find if they contain affirmative answer
    let firstQuestionResponse = await getQuestionResponse(1, 2, issue_body);
    let isCopilotUsed = firstQuestionResponse.some((response) => {
      return (
        response.includes("Sim") ||
        response.includes("Si") ||
        response.includes("Yes") ||
        response.includes("Oui")
      );
    });

    // Get answers to second question and store in pctValue
    let pctValue = await getQuestionResponse(2, 3, issue_body);
    let freqValue = await getQuestionResponse(4, 5, issue_body);
    let savingsInvestedValue = await getQuestionResponse(6, '', issue_body);

    if( isCopilotUsed && pctValue && freqValue && savingsInvestedValue){
      // All questions have been answered and we can close the issue
      app.log.info("Closing the issue");
      try {
        await context.octokit.issues.update({
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          issue_number: context.payload.issue.number,
          state: "closed",
        });
      } catch (err) {
        app.log.error(err);
      }
    }
    
    if (
      firstQuestionResponse.some((response) => {
        return (
          response.includes("Não") ||
          response.includes("No") ||
          response.includes("Non")
        );
      })
    ){
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
        }
      }
    }
    
    let data = {
      enterprise_name: context.payload.enterprise ? context.payload.enterprise.name : '',
      organization_name: context.payload.organization ? context.payload.organization.login : '',
      repository_name: context.payload.repository ? context.payload.repository.name : '',
      issue_id: context.payload.issue ? context.payload.issue.id : '',
      issue_number: context.payload.issue ? context.payload.issue.number : '',
      PR_number: pr_number || '',
      assignee_name: context.payload.issue.assignee ? context.payload.issue.assignee.login : '',
      is_copilot_used: isCopilotUsed ? 1 : 0,
      saving_percentage: pctValue ? pctValue.join(" || ") : '',
      usage_frequency: freqValue ? freqValue.join(" || ") : '',
      savings_invested: savingsInvestedValue ? savingsInvestedValue.join(" || ") : '',
      comment: comment || '',
      created_at: context.payload.issue ? context.payload.issue.created_at : '',
      completed_at: context.payload.issue ? context.payload.issue.updated_at : ''
    };

    return data;

  }

  async function insertIntoDB(context) {
  let conn = null;
  let query = null;
  let status = true;
  let newContent = null;

  try {

    newContent = await GetSurveyData(context);

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
        saving_percentage VARCHAR(200),
        usage_frequency VARCHAR(200),
        savings_invested VARCHAR(200),
        comment VARCHAR(550),
        created_at DATETIME,
        completed_at DATETIME
    );
    `;
    }

    let result =
      await sql.query`SELECT * FROM SurveyResults WHERE Issue_id = ${newContent.issue_id}`;
    app.log.info("Database has been created and issue id existence has been confirmed");

    if (result.recordset.length > 0) {
      // create query
      let update_query = `UPDATE [SurveyResults] SET [is_copilot_used] = ${newContent.is_copilot_used}`;

      for (let key in newContent) {
        if (newContent.hasOwnProperty(key) && newContent[key] !== undefined && key !== "is_copilot_used") {
          update_query += `, [${key}] = '${newContent[key]}'`;
        }
      }

      update_query += ` WHERE [issue_id] = ${newContent.issue_id}`;

      // update existing record
      let update_result = await sql.query(update_query);
      app.log.info(update_result);
    } else {
      // insert new record if it doesn't exist
      let keys = Object.keys(newContent).join(', ');
      let values = Object.values(newContent).map(value => `'${value}'`).join(', ');

      let insert_query = `INSERT INTO SurveyResults (${keys}) VALUES (${values})`;
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

  async function getQuestionResponse(start, end, issue_body) {
    app.log.info("Getting answers for question " + start + " to " + end);
    let AnswerSelected = false;
    let Answers = new Array();
    let Expression = end ? new RegExp(start + "\\. (.*" + end + "\\." + ")?", "s") : new RegExp(start + "\\. (.*" + ")?", "s");
    let QuestionOptions = issue_body.match(Expression)[0].match(/\[x\].*/g);
    if(QuestionOptions){
      AnswerSelected = true;
      QuestionOptions.forEach((option) => {
        let cleanAnswer = option;
        cleanAnswer = cleanAnswer.replace(/\[x\] /g, "");
        Answers.push(cleanAnswer);
      });
    }
    return AnswerSelected ? Answers : null;
  }
};

// Define class for app insights. If no instrumentation key is provided, then no app insights will be used.
class AppInsights {
  constructor() {
    if (APPLICATIONINSIGHTS_CONNECTION_STRING) {
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