/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const dedent = require('dedent');
const fs = require('fs');
const path = require("path");
const sql = require("mssql");
require('dotenv').config();
let comment = null;

const { TextAnalysisClient, AzureKeyCredential } = require("@azure/ai-language-text");
const { KEY, ENDPOINT, ConnString } = process.env;

module.exports = (app) => {
  // Your code here
  app.log.info("Yay, the app was loaded!");

  app.on("pull_request.closed", async (context) => {
    let pr_number = context.payload.pull_request.number;
    let pr_body = context.payload.pull_request.body;
    
    // check language for pr_body
    const client = new TextAnalysisClient(ENDPOINT, new AzureKeyCredential(KEY));
    const result = await client.analyze("LanguageDetection", [pr_body]);

    // read file that aligns with detected language 
    const issue_body = fs.readFileSync('./issue_template/copilot-usage-'+result[0].primaryLanguage.iso6391Name+'.md', 'utf-8');

    // find XXX in file and replace with pr_number
    let fileContent = dedent(issue_body.replace(/XXX/g, '#'+pr_number.toString()) );
    
    // display the body for the issue
    app.log.info(fileContent);

    // create an issue using fileContent as body
    await context.octokit.issues.create({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      title: "Copilot Usage",
      body: fileContent,
      assignee: context.payload.pull_request.user.login,
    });
  });

  app.on("issues.edited", async (context) => {
    if(context.payload.issue.title === "Copilot Usage"){
      await GetSurveyData(context);
    }
  });

  app.on("issue_comment.created", async (context) => {
    if(context.payload.issue.title === "Copilot Usage"){
      comment = context.payload.comment.body;
      await GetSurveyData(context);
    }
  });

  async function GetSurveyData(context){
    let issue_body = context.payload.issue.body;
    let issue_id = context.payload.issue.id;

    // find regex [0-9]\+ in issue_body and get first result
    let pr_number = issue_body.match(/[0-9]+/)[0];

    // find regex \[x\] in issue_body and get complete line in an array
    let checkboxes = issue_body.match(/\[x\].*/g);

    // find if checkboxes array contains Sim o Si or Yes
    let isCopilotUsed = checkboxes.some((checkbox) => {
      return checkbox.includes("Sim") || checkbox.includes("Si") || checkbox.includes("Yes");
    });

    if(comment){
      await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null);
    }

    if(isCopilotUsed){
      await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null);

      // loop through checkboxes and find the one that contains %
      let pctSelected = false;
      let pctValue = new Array();
      for (const checkbox of checkboxes) {
        if(checkbox.includes("%")){
          pctSelected = true;
          copilotPercentage = checkbox;
          copilotPercentage = copilotPercentage.replace(/\[x\] /g, '');
          pctValue.push(copilotPercentage);
          app.log.info(copilotPercentage);
        }
      }
      if(pctSelected){
        // save into sql atabase with connstring

        await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, pctValue);

        // close the issue
        await context.octokit.issues.update({
          owner: context.payload.repository.owner.login,
          repo: context.payload.repository.name,
          issue_number: context.payload.issue.number,
          state: "closed"
        });
      }
    }else{
      if (checkboxes.some((checkbox) => {
        return checkbox.includes("Não") || checkbox.includes("No"); })){

        await insertIntoDB(context, issue_id, pr_number, isCopilotUsed, null);

        if(comment){
          // close the issue
          await context.octokit.issues.update({
            owner: context.payload.repository.owner.login,
            repo: context.payload.repository.name,
            issue_number: context.payload.issue.number,
            state: "closed"
          });
        }
      }
    }
  }

  async function insertIntoDB(context, issue_id, pr_number, isCopilotUsed, pctValue){
    let conn = null;
    try{
      conn = await sql.connect(ConnString);

      let result = await sql.query`SELECT * FROM SurveyResults WHERE issue_id = ${issue_id}`;

      // convert pctValue to string
      if(pctValue){
        pctValue = pctValue.toString();
      }

      if(result.recordset.length > 0){
        // update existing record
        let update_result = await sql.query`UPDATE SurveyResults SET PR_number = ${pr_number}, Value_detected = ${isCopilotUsed}, Value_percentage = ${pctValue}, Value_ndetected_reason = ${comment} WHERE issue_id = ${issue_id}`;
        app.log.info(update_result);
      }else {
        // check if enterprise is present in context.payload
        let enterprise_name = null;
        let assignee_name = null;
        if(context.payload.enterprise){
          enterprise_name = context.payload.enterprise.name;
        }
        if(context.payload.issue.assignee){
          assignee_name = context.payload.issue.assignee.login;
        }
        
        let insert_result = await sql.query`INSERT INTO SurveyResults VALUES(${enterprise_name}, ${context.payload.repository.owner.login}, ${context.payload.repository.name}, ${context.payload.issue.id}, ${context.payload.issue.number}, ${pr_number}, ${assignee_name}, ${isCopilotUsed}, ${pctValue}, ${comment}, ${context.payload.issue.created_at}, ${context.payload.issue.updated_at})`;
        app.log.info(insert_result);
      }
    }catch(err){
      app.log.error(err);
    }finally{
      if(conn){
        conn.close();
      }
    }
  }

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
