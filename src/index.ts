import express, { Request, Response } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { dag4 } from "@stardust-collective/dag4";

// -------------------------
// FIX: Define types locally as DagTransaction is often not a direct export
// -------------------------

interface DagTransaction {
  amount: number;
  fee: number;
  hash: string;
  source: string;
  destination: string;
  timestamp: number;
  isDummy?: boolean; 
  memo?: string;
  transactionOriginal?: {
    value?: {
      memo?: string;
    },
    memo?: string;
  }
  auxiliaryData?: string; 
  transactionOriginalBody?: any;
}

interface PaginatedTxResponse {
  data: DagTransaction[];
  cursor?: string;
}
// -------------------------

const app = express();
app.use(cors());
app.use(bodyParser.json());

const TEMP_PRIVATE_KEY =
  process.env.TEMP_PRIVATE_KEY ||
  "17f146fc6548ee387fa4863043f765934cb25374ba5d67b8dd30ec5e087a927d";
let isNetworkReady = false;

try {
  dag4.network.config({
    id: "IntegrationNet",
    l0Url: "https://l0-lb-integrationnet.constellationnetwork.io",
    l1Url: "https://l1-lb-integrationnet.constellationnetwork.io",
    beUrl: "https://be-integrationnet.constellationnetwork.io",
    networkVersion: "2.0",
  });

  dag4.account.loginPrivateKey(TEMP_PRIVATE_KEY);
  isNetworkReady = true;

} catch (e) {
  isNetworkReady = false;
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
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch balance." });
  }
});

// -------------------------
// Send DAG (dynamic for AI content)
// -------------------------
app.post("/send-dag", async (req: Request, res: Response) => {
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

    res.json({ success: true, tx });
  } catch (err: any) {
    const errorMessage =
      err.message ||
      JSON.stringify(err, Object.getOwnPropertyNames(err)) ||
      "Unknown transaction error";
    res.status(500).json({ success: false, error: `Transaction failed: ${errorMessage}` });
  }
});

// -------------------------
// Fetch all DAG memos / documents
// -------------------------
app.get("/dag-data", async (_req: Request, res: Response) => {
  if (!isNetworkReady)
    return res
      .status(503)
      .json({ success: false, error: "Network not ready." });

  try {
    let allTx: DagTransaction[] = [];
    let cursor: string | undefined = undefined;
    const limit = 100;

    do {
      const rawResponse = await dag4.account.getTransactions({ limit, cursor } as any);

      let txsPage: DagTransaction[] = [];
      let nextCursor: string | undefined = undefined;

      if (Array.isArray(rawResponse)) {
          txsPage = rawResponse as unknown as DagTransaction[];
          nextCursor = undefined;
      } else if (rawResponse && Array.isArray((rawResponse as any).data)) {
          const response = rawResponse as unknown as PaginatedTxResponse; 
          txsPage = response.data;
          nextCursor = response.cursor;
      } else {
          break; 
      }

      allTx = allTx.concat(txsPage);
      cursor = nextCursor;

      if (txsPage.length === 0 && cursor) {
          break; 
      }
    } while (cursor);

    const documents = allTx
      .map((tx: DagTransaction) => {
        let memo: string | undefined = undefined;

        if (tx.memo) {
          memo = tx.memo;
        }

        if (!memo && tx.transactionOriginal?.value?.memo) {
          memo = tx.transactionOriginal.value.memo;
        }

        if (!memo && tx.transactionOriginal?.memo) {
          memo = tx.transactionOriginal.memo;
        }

        if (memo) {
          try { 
            let cleanMemo = memo.replace(/[\n\t\r]/g, '').trim();
            return JSON.parse(cleanMemo); 
          }
          catch (e) {
             try {
                 const unescapedString = JSON.parse(memo);
                 let finalCleanMemo = unescapedString.replace(/[\n\t\r]/g, '').trim();
                 return JSON.parse(finalCleanMemo);
             } catch (e2) {
                 return { raw_memo: memo, hash: tx.hash }; 
             }
          }
        }

        return null;
      })
      .filter(Boolean);

    res.json({ success: true, totalTransactions: allTx.length, documents });
  } catch (err: any) {
    const errorMessage =
      err.message || JSON.stringify(Object.getOwnPropertyNames(err)) || "Unknown error";
    res.status(500).json({ success: false, error: `Failed to fetch DAG data: ${errorMessage}` });
  }
});

// -------------------------
// Start server
// -------------------------
const PORT = Number(process.env.PORT) || 5001;
app.listen(PORT, "0.0.0.0");
