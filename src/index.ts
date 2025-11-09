import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { dag4 } from "@stardust-collective/dag4";

// -------------------------
// FIX: Define types to include new fields like auxiliaryData and the parsed document structure
// -------------------------

/**
 * Interface for the structured document data stored in the transaction memo.
 */
interface DocumentMemo {
    document_id: number;
    title: string;
    hash: string;
    ipfs_cid: string;
    metadata: {};
}

/**
 * Interface representing a standard DAG transaction object.
 */
interface DagTransaction {
    amount: number;
    fee: number;
    hash: string;
    source: string;
    destination: string;
    timestamp: string; // Changed from number to string based on log output
    isDummy?: boolean; 
    memo?: string; // Standard memo location (often empty on fetch)
    auxiliaryData?: string; // Critical field where dag4 often places the memo content
    parent?: { hash: string; ordinal: number; }; // Adding for completeness
    salt?: number;
    blockHash?: string;
    snapshotHash?: string;
    snapshotOrdinal?: number;
    transactionOriginal?: {
      value?: { memo?: string; },
      memo?: string;
    }
    // Note: The rest of the fields from the full dump are implicitly included
}

/**
 * Interface representing the full transaction object enriched with parsed document data.
 */
interface EnrichedTransaction extends DagTransaction {
    document?: DocumentMemo;
}

/**
 * Interface representing the paginated response structure from dag4.account.getTransactions().
 */
interface PaginatedTxResponse {
    data: DagTransaction[]; // Array of transactions
    cursor?: string; // Next cursor string for pagination
}
// -------------------------

const app = express();

app.use(cors({
  origin: [
    "https://haki-chain-liard-eight.vercel.app", // your deployed frontend
    "https://haki-agents-and-web3-layer.onrender.com", 
  ],
  methods: ["GET", "POST"],
  credentials: true,
}));

app.use(bodyParser.json());

// ⚠️ Temporary private key for IntegrationNet testing
const TEMP_PRIVATE_KEY =
  process.env.TEMP_PRIVATE_KEY ||
  "17f146fc6548ee387fa4863043f765934cb25374ba5d67b8dd30ec5e087a927d";
let isNetworkReady = false;

// ➡️ Initialize DAG account and network
try {
  // Set configuration for IntegrationNet FIRST
  dag4.network.config({
    id: "IntegrationNet",
    // Official load balancer URLs for Constellation IntegrationNet
    l0Url: "https://l0-lb-integrationnet.constellationnetwork.io",
    l1Url: "https://l1-lb-integrationnet.constellationnetwork.io",
    beUrl: "https://be-integrationnet.constellationnetwork.io",
    networkVersion: "2.0",
  });
  
  // Log in the account
  dag4.account.loginPrivateKey(TEMP_PRIVATE_KEY);
  
  const address = dag4.account.address;
  console.log(`✅ DAG Account Initialized: ${address}`);
  isNetworkReady = true;
  
} catch (e) {
  // If the private key or configuration fails, log a specific error
  console.error("❌ Fatal Error during DAG Account/Network Initialization:", e);
  console.error("Please verify the TEMP_PRIVATE_KEY is correct and valid for IntegrationNet, and that all URLs are reachable.");
  // isNetworkReady remains false
}


// -------------------------
// Health endpoint
// -------------------------
app.get("/", (_req: Request, res: Response) => {
  res.send("Haki DAG API is running ✅");
});

// -------------------------
// Balance check
// -------------------------
app.get("/balance", async (_req: Request, res: Response) => {
  if (!isNetworkReady)
    return res
      .status(503)
      .json({ success: false, error: "Network not ready." });

  try {
    const balance = await dag4.account.getBalance();
    res.json({ address: dag4.account.address, balance });
  } catch (err: any) {
    console.error("Balance error:", err);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch balance." });
  }
});

// -------------------------
// Send DAG (dynamic for AI content)
// -------------------------
app.post("/send-dag", async (req: Request, res: Response) => {
  console.log("Received /send-dag payload:", req.body); // Log the full payload
  
  if (!isNetworkReady)
    return res
      .status(503)
      .json({ success: false, error: "Network not ready." });

  const { to, amount, memo } = req.body;

  if (!to || !amount) {
    return res.status(400).json({
      success: false,
      error: "Missing required fields: 'to' or 'amount'.",
    });
  }

  try {
    const balance = await dag4.account.getBalance();
    const amountNum = typeof amount === "string" ? parseFloat(amount) : amount;

    if (amountNum > balance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient funds. Balance: ${balance}, Requested: ${amountNum}`,
      });
    }
    
    // Log the memo content right before sending
    console.log(`➡️ Submitting transaction with Memo (length ${memo ? memo.length : 0}): ${memo ? memo.substring(0, 100) + '...' : 'No Memo'}`);

    // Transfer DAG with dynamic memo
    const tx = await dag4.account.transferDag(
      to,
      amountNum,
      0,
      true,
      {
        memo: memo
          ? typeof memo === "string"
            ? memo
            : JSON.stringify(memo)
          : "HakiChain DAG Transfer",
      }
    );
    
    // SUCCESS LOG: Confirms transaction submission
    console.log(`✅ Transaction submitted successfully. Hash: ${tx.hash}`);

    res.json({ success: true, tx });
  } catch (err: any) {
    console.error("Transaction Error (FULL OBJECT):", err);
    const errorMessage =
      err.message ||
      JSON.stringify(err, Object.getOwnPropertyNames(err)) ||
      "Unknown transaction error";
    res.status(500).json({ success: false, error: `Transaction failed: ${errorMessage}` });
  }
});

// -------------------------
// Fetch all DAG memos / documents (CLEANED UP & FIXED)
// -------------------------
app.get("/dag-data", async (_req: Request, res: Response) => {
  if (!isNetworkReady)
    return res
      .status(503)
      .json({ success: false, error: "Network not ready." });

  try {
    let allTx: DagTransaction[] = [];
    let cursor: string | undefined = undefined;
    const limit = 100; // Using a page limit of 100

    // Loop to fetch all transactions page by page until the cursor is null
    do {
      console.log(`Fetching transactions with cursor: ${cursor || 'start'}`);
      
      const rawResponse = await dag4.account.getTransactions({ limit, cursor } as any);

      let txsPage: DagTransaction[] = [];
      let nextCursor: string | undefined = undefined;

      // Robust Runtime Check: Handle different API response formats
      if (Array.isArray(rawResponse)) {
          console.warn("API returned direct array instead of paginated object. Treating as final page.");
          txsPage = rawResponse as unknown as DagTransaction[];
          nextCursor = undefined;
      } else if (rawResponse && Array.isArray((rawResponse as any).data)) {
          const response = rawResponse as unknown as PaginatedTxResponse; 
          txsPage = response.data;
          nextCursor = response.cursor;
      } else {
          console.error("API returned an invalid or missing data structure:", rawResponse);
          break; 
      }
      
      // Append the fetched data to the main list
      allTx = allTx.concat(txsPage);
      
      // Update the cursor for the next iteration
      cursor = nextCursor;

      if (txsPage.length === 0 && cursor) {
          console.warn("Received empty data page but a cursor was provided. Stopping fetch.");
          break; 
      }
    } while (cursor); // Loop continues as long as a cursor exists

    console.log(`Finished fetching. Total transactions found: ${allTx.length}`);

    // Parse memo field and enrich the transaction object
    const enrichedTransactions: EnrichedTransaction[] = allTx
      .map((tx: DagTransaction) => {
        
        let memo: string | undefined = undefined;
        let memoSource: string = 'None';
        const txHashShort = tx.hash.substring(0, 8);
        
        // --- MEMO LOOKUP PRIORITY (FIXED) ---
        // 1. Try the auxiliaryData field (Most common for memo data when fetched)
        if (tx.auxiliaryData) {
            memo = tx.auxiliaryData;
            memoSource = 'tx.auxiliaryData';
        } 
        // 2. Fall back to top-level memo
        else if (tx.memo) {
            memo = tx.memo;
            memoSource = 'tx.memo';
        }
        // 3. Fall back to nested memo fields (less common)
        else if (tx.transactionOriginal?.value?.memo) {
            memo = tx.transactionOriginal.value.memo;
            memoSource = 'tx.transactionOriginal.value.memo';
        } else if (tx.transactionOriginal?.memo) {
            memo = tx.transactionOriginal.memo;
            memoSource = 'tx.transactionOriginal.memo';
        }

        if (!memo) {
            console.log(`[MEMO DEBUG] TX ${txHashShort}...: No document memo found. Skipping parsing.`);
            // If no memo is found, return the original transaction data without a document field
            return tx as EnrichedTransaction; 
        }

        // --- MEMO PARSING ---
        console.log(`[MEMO PARSE] TX ${txHashShort}...: Found memo in ${memoSource}. Attempting to parse.`);
        let cleanMemo = memo.replace(/[\n\t\r]/g, '').trim();
        let parsedDocument: DocumentMemo | null = null;
        
        try {
            parsedDocument = JSON.parse(cleanMemo);
            
            // Basic validation to confirm it's a document object
            if (typeof parsedDocument === 'object' && parsedDocument !== null && parsedDocument.document_id) {
                console.log(`[MEMO PARSE] TX ${txHashShort}...: Successfully parsed valid document.`);
                // Return the full transaction object with the document attached
                return { ...tx, document: parsedDocument } as EnrichedTransaction;
            }
            
            console.warn(`[MEMO PARSE] TX ${txHashShort}...: Parsed but did not contain a 'document_id'. Treating as non-document memo.`);
            
        } catch (e) {
             // If the memo failed JSON parsing, it might be a double-escaped string
             try {
                const unescapedString = JSON.parse(cleanMemo);
                parsedDocument = JSON.parse(unescapedString.replace(/[\n\t\r]/g, '').trim());

                if (typeof parsedDocument === 'object' && parsedDocument !== null && parsedDocument.document_id) {
                     console.log(`[MEMO PARSE] TX ${txHashShort}...: Successfully double-parsed valid document.`);
                     return { ...tx, document: parsedDocument } as EnrichedTransaction;
                }
             } catch (e2) {
                 console.error(`[MEMO ERROR] TX ${txHashShort}...: Failed to parse memo in two attempts. Memo is likely not JSON data. Skipping document enrichment.`);
             }
        }
        
        // If parsing failed or the parsed content wasn't a document, return the original transaction
        return tx as EnrichedTransaction;

      })
      .filter(Boolean); // Filter should not be strictly necessary now, but good for safety

    // FIX: Respond with the array of enriched transactions, not just the memos.
    res.json({ success: true, totalTransactions: enrichedTransactions.length, transactions: enrichedTransactions });
  } catch (err: any) {
    console.error("DAG data fetch error:", err);
    const errorMessage =
      err.message || JSON.stringify(err, Object.getOwnPropertyNames(err)) || "Unknown error";
    res.status(500).json({ success: false, error: `Failed to fetch DAG data: ${errorMessage}` });
  }
});

// -------------------------
// Start server
// -------------------------
const PORT = Number(process.env.PORT) || 5001;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`🚀 DAG API running on port ${PORT}`)
);