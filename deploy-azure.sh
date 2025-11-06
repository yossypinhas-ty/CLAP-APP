#!/bin/bash

# Azure Web App Deployment Script for CLAP Audio Detector
# This script automates the deployment process

set -e

# Configuration
RESOURCE_GROUP="clap-app-rg"
LOCATION="eastus"
ACR_NAME="clapappregistry"
APP_SERVICE_PLAN="clap-app-plan"
WEB_APP_NAME="clap-audio-detector"
IMAGE_TAG="v1"

echo "🚀 Starting Azure Web App Deployment..."

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first."
    echo "Visit: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker Desktop first."
    echo "Visit: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Login to Azure
echo "🔐 Logging in to Azure..."
az login

# Create Resource Group
echo "📦 Creating resource group: $RESOURCE_GROUP..."
az group create --name $RESOURCE_GROUP --location $LOCATION

# Create Azure Container Registry
echo "🏗️  Creating Azure Container Registry: $ACR_NAME..."
az acr create --resource-group $RESOURCE_GROUP --name $ACR_NAME --sku Basic

# Enable admin access
echo "🔑 Enabling admin access to ACR..."
az acr update -n $ACR_NAME --admin-enabled true

# Login to ACR
echo "🔐 Logging in to Azure Container Registry..."
az acr login --name $ACR_NAME

# Get ACR login server
ACR_LOGIN_SERVER=$(az acr show --name $ACR_NAME --query loginServer --output tsv)
echo "📍 ACR Login Server: $ACR_LOGIN_SERVER"

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t $ACR_LOGIN_SERVER/clap-app:$IMAGE_TAG .

# Push to ACR
echo "⬆️  Pushing image to ACR..."
docker push $ACR_LOGIN_SERVER/clap-app:$IMAGE_TAG

# Create App Service Plan
echo "📋 Creating App Service Plan: $APP_SERVICE_PLAN..."
az appservice plan create \
  --name $APP_SERVICE_PLAN \
  --resource-group $RESOURCE_GROUP \
  --is-linux \
  --sku B1

# Get ACR credentials
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --query username --output tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --query passwords[0].value --output tsv)

# Create Web App
echo "🌐 Creating Web App: $WEB_APP_NAME..."
az webapp create \
  --resource-group $RESOURCE_GROUP \
  --plan $APP_SERVICE_PLAN \
  --name $WEB_APP_NAME \
  --deployment-container-image-name $ACR_LOGIN_SERVER/clap-app:$IMAGE_TAG

# Configure Web App
echo "⚙️  Configuring Web App..."
az webapp config container set \
  --name $WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --docker-custom-image-name $ACR_LOGIN_SERVER/clap-app:$IMAGE_TAG \
  --docker-registry-server-url https://$ACR_LOGIN_SERVER \
  --docker-registry-server-user $ACR_USERNAME \
  --docker-registry-server-password $ACR_PASSWORD

# Set port configuration
az webapp config appsettings set \
  --resource-group $RESOURCE_GROUP \
  --name $WEB_APP_NAME \
  --settings WEBSITES_PORT=80

# Get the URL
WEB_APP_URL=$(az webapp show \
  --name $WEB_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --query defaultHostName \
  --output tsv)

echo ""
echo "✨ Deployment completed successfully!"
echo ""
echo "🌍 Your app is available at: https://$WEB_APP_URL"
echo ""
echo "📊 Useful commands:"
echo "  View logs: az webapp log tail --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP"
echo "  Restart:   az webapp restart --name $WEB_APP_NAME --resource-group $RESOURCE_GROUP"
echo "  Delete:    az group delete --name $RESOURCE_GROUP --yes --no-wait"
echo ""
