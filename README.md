# copilot-survey-engine

> A GitHub App built with [Probot](https://github.com/probot/probot) to prompt developers about their experience with Copilot!

## App Objective

As more companies adopt Copilot, there's an increasing need to measure the benefits in the organization. For such it is important to have in mind not only to do a quantitative analysis, but also qualitative. Combining quantitative and qualitative analysis is crucial in understanding the developer experience when using a tool. While quantitative analysis can provide valuable insights into usage patterns, adoption rates, and other measurable data, it doesn't tell the full story of how developers feel about a tool. Specially taking into consideration that there's many ways to interact with Copilot and get value from it, but not all of these are possible to be captured in KPIs as of now. 

To gain a deeper understanding of user satisfaction, a qualitative survey is key. This app intends to help companis on that journey, so we can start with 3 basic questions and integrate them in the very tool, so it's also part of the DevOps lifecycle. This information is hosted on a database so it can provide insight into how developers are using the tool, what value they're perceiving to receive and challenges that have been presented.

I hope you can get value from this project and feel free to contribute and build on top of this!

## How it works

The App listens on 3 main events: Pull Request closed, issue edited and issue comment created. Once a Pull Request has been closed, the workflow will trigger and create an issue asking the identified survey questions. We are able to support English, Spanish, Portuguese and French so the engine will do a language analysis on the description of the Pull Request to try to match the same language in the issue creation. 

Once the issue is created, the following questions are presented to the developer:

### Copilot Usage Survey

Hi! 👋  As part of our efforts to continually improve our DevOps processes, we would like to gather your valuable feedback on your experience with Copilot for Pull Request #26 by asking the following questions:

1. Did Copilot save time or increase productivity in developing this component?
- Yes
- No
2. If answer 1 is Yes, how much was the improvement (5%, 10%, 20%, 30% or more)?
- <5%
- 5%-10%
- 10%-20%
- 20%-30%
- \>30%
3. If answer 1 is No, please explain why in a comment

As we receive edits on the issue, the App will validate the responses received (options selected) and once all questions have been answered, the issue will be closed automatically and the responses will be saved into a database. 

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

As a first time execution probot will prompt you for creating a new GitHub App or connect it with an existing App. As you complete the requested information, a .env file will get created in your local source code and all the private information regarding your GitHub App will be automatically written there. 

You will also need to provide the DATABASE_CONNECTION_STRING in your env file. 

Optionally if you'll be also using Application Ingishts please provide the value for APPLICATIONINSIGHTS_CONNECTION_STRING. You can search for this in your Azure Portal, going to the resource group you've created previously. Select the resource of type Application Insights and copy the Connection String in the Essentials section of the Overview page. 

Optionally if you'll be also using Languange detection API please provide the value for LANGUAGE_API_ENDPOINT, LANGUAGE_API_KEY. You can search for this in your Azure Portal, going to the resource group you've created previously. Select the resource of type Language and go to Keys and Endpoint. Copy one of the keys and corresponding endpoint. 

### Step 3. Deploy your App!

For a quick deployment you could open your Visual Studio Code and open the cloned project. Make sure you have the Azure Tools extension installed. If not, please install it https://marketplace.visualstudio.com/items?itemName=ms-vscode.vscode-node-azure-pack

Once you have the extension sign in to Azure with your credentials go to your Explorer view and right click in the file directory to select the option "Deploy to web app". Select the subscription you'd like to use to deploy

## Contributing

If you have suggestions for how copilot-survey-engine could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2023 Mabel Geronimo
