/**
 * This is the main entrypoint to your Probot app
 * @param {import('probot').Probot} app
 */

const dedent = require('dedent');
const fs = require('fs');
const path = require("path");
require('dotenv').config();

const { TextAnalysisClient, AzureKeyCredential } = require("@azure/ai-language-text");
const { KEY, ENDPOINT } = process.env;

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
    });
  });

  // For more information on building apps:
  // https://probot.github.io/docs/

  // To get your app running against GitHub, see:
  // https://probot.github.io/docs/development/
};
