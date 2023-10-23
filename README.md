# copilot-survey-engine

> A GitHub App built with [Probot](https://github.com/probot/probot) to prompt developers about their experience with Copilot!

## App Objective

As more companies adopt GitHub Copilot, it becomes increasingly important to measure the benefits it brings to the organization. This survey is an effort to combine both quantitative and qualitative data. To improve validity of the quantitative responses, Developers are asked to document their rationale for the time-savings percentage they choose. 

Quantitative feedback from the Developer at the time of creating a PR provides valuable insights on the time savings experienced by the Developer. Time savings is needed first before other downstream impacts (like velocity increases, or other improvements can happen. The level of granularity provides multiple feedback opportunities for Developers and can capture a variety of PRs so we can understand adoption challenges and improvement opportunities. If helpful, the Survey results may also be combined with Key Performance Indicators (KPIs) that the product provides to further contextualize the survey responses.

The survey responses are stored in your private Azure SQL database to provide insights into how developers are using the tool, the value they report, and the challenges they encounter.

We hope that this project provides value to your organization, and we encourage you to contribute and build upon it. Your contributions can help further enhance the survey capabilities and provide even greater insights into the developer experience with Copilot.

## How it works

The application actively monitors three key events: the closure of a pull request, editing of an issue, and creation of an issue comment.

### How a survey gets created

When a pull request is closed, the app automatically creates an issue that prompts the user with relevant survey questions. Our application is equipped to handle multiple languages, including English, Spanish, Portuguese, and French. For this, the engine performs a language analysis on the pull request description, matching it with the appropriate language when generating the corresponding issue. 

Note: *If the env file does not contain a Language API Key or Endpoint, the analysis will be skipped and the default language will always be English.*

### Sample screenshot of a survey 
### Copilot Usage Survey

1. ***Did you use Copilot in developing this PR? (If you select No, just answer question 5***
- [ ] No
- [ ] Yes

2. Compared to your previous experience coding WITHOUT using Copilot, 

   ***How much less time did the coding take during this PR with Copilot?***
   
   (Example: The PR would normally take 5 days, but only took 4 days with Copilot then the answer is 20%)
- [ ] 0%
- [ ] > 0% but < 10%
- [ ] > 11% but < 20%
- [ ] > 21% but < 30%
- [ ] ≥ 31% but < 40%
- [ ] ≥ 41%

3. ***Describe your thought process for calculating (or estimating) the time saved in Question 2***
    
 - [ replace this line with your answer. ]

4. ***How often did you use Copilot in this PR?***
- [ ] All or most of the time
- [ ] About Half of the time
- [ ] Some of the time
- [ ] Not very much

5. ***What other information can you share about Copilot's ability to save you time coding?*** 

 - [ replace this line with your answer. ]

### Where does the app store surveys?

As we receive edits on the issue, the App will validate the responses received (options selected) and once all questions have been answered, the issue will be closed automatically and the responses will be saved into a private SQL database.

## Setup. Deploy on your own environment

For doing a local deployment of this GitHub App, you will need to set up an environment with the following components:
- Web Server
- SQL Database
- Azure Cognitive Service for Language (optional)
- Azure Applications Insights (optional)

The web server and SQL database are the minimum requirements for this app to work and can be hosted on any environment of your choosing (cloud or on-prem). If you decide to do the deployment on Azure, this guide will help you!

### Step 1. Create the resources

You can use this link to deploy all resources automatically in your Azure subscription [![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fmageroni%2Fcopilot-survey-engine%2Fmain%2Fdeployment%2Ftemplate.json)

### Step 2. Execute locally and configure secrets

To run the application on you local machine you'll need to have installed NodeJS. Once you have it, you can access to the folder where you've cloned this project and run the following:

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

As a first time execution probot will prompt you for creating a new GitHub App or connect it with an existing App. As you complete the requested information, a .env file will get created in your local source code and all the private information regarding your GitHub App will be automatically written there. If you need guidance on how to configure your first GitHub App, please review this guide https://probot.github.io/docs/development/#configuring-a-github-app.

You will also need to provide the DATABASE_CONNECTION_STRING in your env file. 

Optionally if you'll be also using Application Ingishts please provide the value for APPLICATIONINSIGHTS_CONNECTION_STRING. You can search for this in your Azure Portal, going to the resource group you've created previously. Select the resource of type Application Insights and copy the Connection String in the Essentials section of the Overview page. 

Optionally if you'll be also using Languange detection API please provide the value for LANGUAGE_API_ENDPOINT, LANGUAGE_API_KEY. You can search for this in your Azure Portal, going to the resource group you've created previously. Select the resource of type Language and go to Keys and Endpoint. Copy one of the keys and corresponding endpoint. 

### Step 3. Deploy your App!

For a quick deployment you could open your Visual Studio Code and open the cloned project. Make sure you have the Azure Tools extension installed. If not, please install it https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-node-azure-pack

Once you have the extension sign in to Azure with your credentials go to your Explorer view and right click in the file directory to select the option "Deploy to web app". Select the subscription in which you've created the resources in step 1. Select the name you chose for the App Service created in step 1. 

Finally go to your GitHub App and update your webhook URL to reflect your App Service URL. 


### Step 4. Test your App!

Make sure you have your app installed in at least one repo.

In such repo, create a pull request and close it (either close it or merge/complete it). Confirm that an issue has been created with the name "Copilot Usage - PR#XX". Answer the questions and confirm that the issue is closed and the data has been recorded into your database. 

Congrats!!!!! Enjoy and keep expanding the project. 

## Contributing

If you have suggestions for how copilot-survey-engine could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2023 Mabel Geronimo
