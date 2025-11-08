# Constellation Server

A Node.js/Express backend for interacting with the Constellation DAG network.  
Provides endpoints for DAG account management, balance queries, transactions, and fetching DAG memos/documents.

---

## Features

- Initialize and manage a DAG account on Constellation IntegrationNet
- Check account balance
- Send DAG with dynamic memo support
- Fetch and parse DAG transaction memos/documents
- Paginated retrieval of DAG transactions
- Ready-to-deploy Express server with CORS and JSON body parsing

---

## Installation

Clone the repository:

```bash
git clone https://github.com/Nick-Maximillien/constellation_server.git
cd constellation_server
Install dependencies:

bash
Copy code
npm install
Configuration
Set the following environment variables in a .env file or your deployment environment:

env
Copy code
PORT=5001
TEMP_PRIVATE_KEY=<your_private_key_for_IntegrationNet>
PORT: Port for the Express server (default: 5001)

TEMP_PRIVATE_KEY: Private key for DAG account access on IntegrationNet

Running the Server
Start the server:

bash
Copy code
npm start
The server will be available at:

arduino
Copy code
http://localhost:5001
API Endpoints
Health Check
sql
Copy code
GET /
Returns a simple message confirming the server is running.

Check Balance
bash
Copy code
GET /balance
Returns the DAG account balance.

Response example:

json
Copy code
{
  "address": "<dag_account_address>",
  "balance": 123.45
}
Send DAG
bash
Copy code
POST /send-dag
Send DAG to another address with optional memo.

Request body:

json
Copy code
{
  "to": "<destination_address>",
  "amount": 10.5,
  "memo": "Optional memo text"
}
Response returns the transaction object.

Fetch DAG Transactions & Memos
bash
Copy code
GET /dag-data
Retrieves all DAG transactions and parses memo content.

Supports pagination internally.

Response example:

json
Copy code
{
  "success": true,
  "totalTransactions": 42,
  "documents": [
    {
      "id": 123,
      "owner": "<dag_account_address>",
      "metadata": {...},
      "metadata_hash": "abc123",
      "registeredAt": "2025-11-08T12:34:56Z",
      "version": 1
    }
  ]
}
Notes
This backend is designed for IntegrationNet testing.

Sensitive private keys should never be committed; always use environment variables.

Designed to work with HakiChain DAG integration and AI-driven memo content.

License
MIT License

pgsql
Copy code

I can also provide a **slim, deploy-ready version** that’s less verbose but still professional if you want a cleaner GitHub landing page.  

Do you want me to do that?