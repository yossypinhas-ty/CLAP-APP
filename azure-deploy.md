# Azure Web App Deployment Guide

## Prerequisites
1. Install [Azure CLI](https://docs.microsoft.com/en-us/cli/azure/install-azure-cli)
2. Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
3. Azure subscription

## Option 1: Deploy using Azure Container Registry (Recommended)

### Step 1: Login to Azure
```bash
az login
```

### Step 2: Create Resource Group
```bash
az group create --name clap-app-rg --location eastus
```

### Step 3: Create Azure Container Registry
```bash
az acr create --resource-group clap-app-rg --name clapappregistry --sku Basic
```

### Step 4: Enable Admin Access
```bash
az acr update -n clapappregistry --admin-enabled true
```

### Step 5: Login to ACR
```bash
az acr login --name clapappregistry
```

### Step 6: Build and Push Docker Image
```bash
# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name clapappregistry --query loginServer --output tsv)

# Build the image
docker build -t $ACR_LOGIN_SERVER/clap-app:v1 .

# Push to ACR
docker push $ACR_LOGIN_SERVER/clap-app:v1
```

### Step 7: Create App Service Plan
```bash
az appservice plan create \
  --name clap-app-plan \
  --resource-group clap-app-rg \
  --is-linux \
  --sku B1
```

### Step 8: Create Web App
```bash
az webapp create \
  --resource-group clap-app-rg \
  --plan clap-app-plan \
  --name clap-audio-detector \
  --deployment-container-image-name $ACR_LOGIN_SERVER/clap-app:v1
```

### Step 9: Configure Web App to use ACR
```bash
# Get ACR credentials
ACR_USERNAME=$(az acr credential show --name clapappregistry --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name clapappregistry --query passwords[0].value --output tsv)

# Configure the web app
az webapp config container set \
  --name clap-audio-detector \
  --resource-group clap-app-rg \
  --docker-custom-image-name $ACR_LOGIN_SERVER/clap-app:v1 \
  --docker-registry-server-url https://$ACR_LOGIN_SERVER \
  --docker-registry-server-user $ACR_USERNAME \
  --docker-registry-server-password $ACR_PASSWORD
```

### Step 10: Configure Port
```bash
az webapp config appsettings set \
  --resource-group clap-app-rg \
  --name clap-audio-detector \
  --settings WEBSITES_PORT=80
```

### Step 11: Get the URL
```bash
az webapp show \
  --name clap-audio-detector \
  --resource-group clap-app-rg \
  --query defaultHostName \
  --output tsv
```

Your app will be available at: `https://clap-audio-detector.azurewebsites.net`

## Option 2: Deploy from Docker Hub

### Step 1: Build and Push to Docker Hub
```bash
# Login to Docker Hub
docker login

# Build the image
docker build -t yourusername/clap-app:v1 .

# Push to Docker Hub
docker push yourusername/clap-app:v1
```

### Step 2: Create Web App from Docker Hub
```bash
az webapp create \
  --resource-group clap-app-rg \
  --plan clap-app-plan \
  --name clap-audio-detector \
  --deployment-container-image-name yourusername/clap-app:v1
```

## Testing Locally

### Build and run locally:
```bash
# Build the Docker image
docker build -t clap-app .

# Run the container
docker run -p 8080:80 clap-app

# Visit http://localhost:8080
```

## Update Deployment

When you make changes:

```bash
# Rebuild and push
docker build -t $ACR_LOGIN_SERVER/clap-app:v2 .
docker push $ACR_LOGIN_SERVER/clap-app:v2

# Update web app
az webapp config container set \
  --name clap-audio-detector \
  --resource-group clap-app-rg \
  --docker-custom-image-name $ACR_LOGIN_SERVER/clap-app:v2
```

## Monitor and Troubleshoot

### View logs:
```bash
az webapp log tail --name clap-audio-detector --resource-group clap-app-rg
```

### Restart the app:
```bash
az webapp restart --name clap-audio-detector --resource-group clap-app-rg
```

### Check app status:
```bash
az webapp show --name clap-audio-detector --resource-group clap-app-rg --query state
```

## Cleanup Resources

To delete all resources:
```bash
az group delete --name clap-app-rg --yes --no-wait
```

## Cost Considerations

- **B1 App Service Plan**: ~$13/month
- **Basic Container Registry**: ~$5/month
- **Total**: ~$18/month

For production, consider:
- S1 plan for better performance (~$70/month)
- Standard Container Registry for better throughput (~$20/month)
- Application Insights for monitoring (~$5/month)
