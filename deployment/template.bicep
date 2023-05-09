@description('azure region for deployment')
param azureRegion string = resourceGroup().location

@description('unique web app name')
param appServiceName string

@description('unique server app name')
param aspServerFarmName string

@description('unique database server name')
param sqlServerName string

@description('Azure SQL DB administrator login name')
param sqlAdministratorLogin string

@description('Azure SQL DB administrator password')
@secure()
param sqlAdministratorLoginPassword string

@description('application insights name')
param appInsightsName string

@description('cognitive service for language name')
param languageServiceName string

@description('virtual network name')
param virtualNetworksVnetName string

@description('virtual network address space')
param virtualNetworksAddressSpace string = '10.0.0.0/24'

@description('subnet address space for database')
param subnetsSqldatabaseAddressSpace string = '10.0.0.128/28'

@description('subnet address space for app service')
param subnetsAppserviceAddressSpace string = '10.0.0.0/25'

@description('network security group name')
param networkSecurityGroupsNsgName string

@description('private endpoint name')
param privateEndpointSqlServerName string

@description('private endpoint nic name')
param networkInterfacesPrvEndpointNicName string

@description('log analytics workspace id')
param workspacesLogAnalyticsName string

@description('github app id')
param githubAppId string

@description('github app webhook secret')
@secure()
param githubAppWebhookSecret string

var privateDnsZoneDatabaseName = 'privatelink${environment().suffixes.sqlServerHostname}'

resource nsg 'Microsoft.Network/networkSecurityGroups@2022-09-01' = {
  name: networkSecurityGroupsNsgName
  location: azureRegion
  properties: {
    securityRules: []
  }
  dependsOn: []
}

// log analytics workspace resource
resource logAnalyticsWorkspace 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: workspacesLogAnalyticsName
  location: azureRegion
  properties: {
    retentionInDays: 90
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource vnet 'Microsoft.Network/virtualNetworks@2022-09-01' = {
  name: virtualNetworksVnetName
  location: azureRegion
  properties: {
    addressSpace: {
      addressPrefixes: [
        virtualNetworksAddressSpace
      ]
    }
    virtualNetworkPeerings: []
    enableDdosProtection: false
    subnets: [
      {
        name: 'AppServiceSnet'
        properties: {
          addressPrefix: subnetsAppserviceAddressSpace
          networkSecurityGroup: {
            id: nsg.id
          }
          delegations: [
            {
              name: 'delegation'
              properties: {
                serviceName: 'Microsoft.Web/serverfarms'
              }
              type: 'Microsoft.Network/virtualNetworks/subnets/delegations'
            }
          ]
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Enabled'
        }
      }
      {
        name: 'SqlDatabaseSnet'
        properties: {
          addressPrefix: subnetsSqldatabaseAddressSpace
          networkSecurityGroup: {
            id: nsg.id
          }
          serviceEndpoints: []
          delegations: []
          privateEndpointNetworkPolicies: 'Disabled'
          privateLinkServiceNetworkPolicies: 'Enabled'
        }
      }
    ]
  }
}

resource languageService 'Microsoft.CognitiveServices/accounts@2022-12-01' = {
  name: languageServiceName
  location: azureRegion
  sku: {
    name: 'S'
  }
  kind: 'TextAnalytics'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    apiProperties: {}
    customSubDomainName: languageServiceName
    networkAcls: {
      defaultAction: 'Allow'
      virtualNetworkRules: []
      ipRules: []
    }
    publicNetworkAccess: 'Enabled'
  }
}

resource appInsights 'microsoft.insights/components@2020-02-02' = {
  name: appInsightsName
  location: azureRegion
  kind: 'web'
  properties: {
    Application_Type: 'web'
    Flow_Type: 'Redfield'
    Request_Source: 'IbizaWebAppExtensionCreate'
    RetentionInDays: 90
    WorkspaceResourceId: logAnalyticsWorkspace.id
    publicNetworkAccessForIngestion: 'Enabled'
    publicNetworkAccessForQuery: 'Enabled'
  }
}

resource privateDnsZoneDatabase 'Microsoft.Network/privateDnsZones@2018-09-01' = {
  name: privateDnsZoneDatabaseName
  location: 'global'
}

resource sqlServer 'Microsoft.Sql/servers@2022-05-01-preview' = {
  name: sqlServerName
  location: azureRegion
  properties: {
    administratorLogin: sqlAdministratorLogin
    administratorLoginPassword: sqlAdministratorLoginPassword
    version: '12.0'
    publicNetworkAccess: 'Disabled'
  }
}

resource aspServerFarm 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: aspServerFarmName
  location: azureRegion
  sku: {
    name: 'S1'
    tier: 'Standard'
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource sqlDatabase 'Microsoft.Sql/servers/databases@2022-08-01-preview' = {
  parent: sqlServer
  name: 'copilotUsage'
  location: azureRegion
  sku: {
    name: 'GP_Gen5'
    tier: 'GeneralPurpose'
    family: 'Gen5'
    capacity: 2
  }
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 34359738368
    catalogCollation: 'SQL_Latin1_General_CP1_CI_AS'
    zoneRedundant: false
    licenseType: 'LicenseIncluded'
    readScale: 'Disabled'
    requestedBackupStorageRedundancy: 'Local'
    isLedgerOn: false
    availabilityZone: 'NoPreference'
  }
}

resource vnetLinkDb 'Microsoft.Network/privateDnsZones/virtualNetworkLinks@2018-09-01' = {
  parent: privateDnsZoneDatabase
  name: '${privateDnsZoneDatabaseName}-${virtualNetworksVnetName}-link'
  location: 'global'
  properties: {
    registrationEnabled: false
    virtualNetwork: {
      id: vnet.id
    }
  }
}

resource privateEndpointSqlServer 'Microsoft.Network/privateEndpoints@2022-09-01' = {
  name: privateEndpointSqlServerName
  location: azureRegion
  properties: {
    privateLinkServiceConnections: [
      {
        name: privateEndpointSqlServerName
        properties: {
          privateLinkServiceId: sqlServer.id
          groupIds: [
            'sqlServer'
          ]
          privateLinkServiceConnectionState: {
            status: 'Approved'
            description: 'Auto-approved'
            actionsRequired: 'None'
          }
        }
      }
    ]
    manualPrivateLinkServiceConnections: []
    customNetworkInterfaceName: networkInterfacesPrvEndpointNicName
    subnet: {
      id: vnet.properties.subnets[1].id
    }
    ipConfigurations: []
    customDnsConfigs: []
  }
}

resource privatednsZoneGroupSqlServer 'Microsoft.Network/privateEndpoints/privateDnsZoneGroups@2022-09-01' = {
  parent: privateEndpointSqlServer
  name: 'default'
  properties: {
    privateDnsZoneConfigs: [
      {
        name: 'privatelink-database-windows-net'
        properties: {
          privateDnsZoneId: privateDnsZoneDatabase.id
        }
      }
    ]
  }
}

resource appService 'Microsoft.Web/sites@2022-09-01' = {
  name: appServiceName
  location: azureRegion
  kind: 'app,linux'
  properties: {
    serverFarmId: aspServerFarm.id
    vnetRouteAllEnabled: true

    siteConfig: {
      numberOfWorkers: 1
      linuxFxVersion: 'NODE|18-lts'
      alwaysOn: true
      appSettings: [
        {
          name: 'APP_ID'
          value: githubAppId
        }
        {
          name: 'PRIVATE_KEY'
          value: ''
        }
        {
          name: 'WEBHOOK_SECRET'
          value: githubAppWebhookSecret
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'ApplicationInsightsAgent_EXTENSION_VERSION'
          value: '~3'
        }
        {
          name: 'DATABASE_CONNECTION_STRING'
          value: 'Server=tcp:${sqlServer.name}${environment().suffixes.sqlServerHostname},1433;Initial Catalog=copilotUsage;Persist Security Info=False;User ID=${sqlAdministratorLogin};Password=${sqlAdministratorLoginPassword};MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;'
        }
        {
          name: 'LANGUAGE_API_ENDPOINT'
          value: languageService.properties.endpoint
        }
        {
          name: 'LANGUAGE_API_KEY'
          value: ''
        }
      ]
    }
    httpsOnly: true
    redundancyMode: 'None'
    publicNetworkAccess: 'Enabled'
    virtualNetworkSubnetId: vnet.properties.subnets[0].id

  }
}

resource appServiceVnetConnection 'Microsoft.Web/sites/virtualNetworkConnections@2022-09-01' = {
  parent: appService
  name: '0b978347-989b-4d5a-a91a-cc98ca852b73_AppServiceSnet'
  properties: {
    vnetResourceId: vnet.properties.subnets[0].id
    isSwift: true
  }
}
