import logging
import os
from pathlib import Path

from aiohttp import web
import requests
from azure.core.credentials import AzureKeyCredential
from azure.identity import AzureDeveloperCliCredential, DefaultAzureCredential
from dotenv import load_dotenv

from rtmt import RTMiddleTier

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("voicerag")

async def avatar_token(request):
    import os
    import json
    AZURE_SPEECH_KEY = os.environ.get("AZURE_SPEECH_KEY")
    AZURE_SPEECH_REGION = os.environ.get("AZURE_SPEECH_REGION")
    if not AZURE_SPEECH_KEY or not AZURE_SPEECH_REGION:
        return web.json_response({"error": "Missing Azure Speech key or region"}, status=500)
    # Get a token from Azure Speech
    token_url = f"https://{AZURE_SPEECH_REGION}.api.cognitive.microsoft.com/sts/v1.0/issueToken"
    headers = {"Ocp-Apim-Subscription-Key": AZURE_SPEECH_KEY, "Content-Length": "0"}
    resp = requests.post(token_url, headers=headers)
    if resp.status_code != 200:
        return web.json_response({"error": "Failed to get Azure Speech token"}, status=500)
    token = resp.text
    # For demo, return dummy relay info (replace with real TURN/ICE info if needed)
    relay = {
        "Urls": ["stun:stun.l.google.com:19302"],
        "Username": "",
        "Password": ""
    }
    return web.json_response({
        "token": token,
        "region": AZURE_SPEECH_REGION,
        "relay": relay
    })

async def create_app():
    if not os.environ.get("RUNNING_IN_PRODUCTION"):
        logger.info("Running in development mode, loading from .env file")
        load_dotenv()

    llm_key = os.environ.get("AZURE_OPENAI_API_KEY")

    credential = None
    if not llm_key:
        if tenant_id := os.environ.get("AZURE_TENANT_ID"):
            logger.info("Using AzureDeveloperCliCredential with tenant_id %s", tenant_id)
            credential = AzureDeveloperCliCredential(tenant_id=tenant_id, process_timeout=60)
        else:
            logger.info("Using DefaultAzureCredential")
            credential = DefaultAzureCredential()
    llm_credential = AzureKeyCredential(llm_key) if llm_key else credential
    
    app = web.Application()

    rtmt = RTMiddleTier(
        credentials=llm_credential,
        endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        deployment=os.environ["AZURE_OPENAI_REALTIME_DEPLOYMENT"],
        voice_choice=os.environ.get("AZURE_OPENAI_REALTIME_VOICE_CHOICE") or "alloy"
        )
    rtmt.system_message = "You are a helpful assistant. Answer questions as concisely as possible. If you don't know the answer, say you don't know."
    rtmt.attach_to_app(app, "/realtime")

    current_directory = Path(__file__).parent
    app.router.add_get('/avatar/token', avatar_token)
    app.add_routes([web.get('/', lambda _: web.FileResponse(current_directory / 'static/index.html'))])
    app.router.add_static('/', path=current_directory / 'static', name='static')
    
    return app

if __name__ == "__main__":
    host = "localhost"
    port = 8765
    web.run_app(create_app(), host=host, port=port)
