const express = require("express");
const https = require("https");
const app = express();

app.use(express.json());

// ---- Config from environment variables ----
const PORT = process.env.PORT || 3001;
const PROXY_SECRET = process.env.PROXY_SECRET;
const CERT_PEM = process.env.TELLER_CERT_PEM?.replace(/\\n/g, "\n");
const KEY_PEM = process.env.TELLER_KEY_PEM?.replace(/\\n/g, "\n");

// ---- Auth middleware ----
function requireSecret(req, res, next) {
  const secret = req.headers["x-proxy-secret"];
  if (!PROXY_SECRET || secret !== PROXY_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ---- Teller mTLS fetch ----
function tellerRequest(path, accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.teller.io",
      path,
      method: "GET",
      cert: CERT_PEM,
      key: KEY_PEM,
      headers: {
        Authorization: "Basic " + Buffer.from(accessToken + ":").toString("base64"),
        "Accept": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// ---- Health check ----
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    cert_loaded: !!CERT_PEM,
    key_loaded: !!KEY_PEM,
    secret_set: !!PROXY_SECRET,
  });
});

// ---- GET /accounts ----
// Body: { enrollments: [{ accessToken }] }
app.post("/accounts", requireSecret, async (req, res) => {
  const { enrollments } = req.body;
  if (!enrollments?.length) return res.json({ accounts: [] });

  let accounts = [];
  for (const enr of enrollments) {
    try {
      const result = await tellerRequest("/accounts", enr.accessToken);
      if (result.status !== 200) continue;

      for (const acct of result.body) {
        let balance = null;
        try {
          const bResult = await tellerRequest(`/accounts/${acct.id}/balances`, enr.accessToken);
          if (bResult.status === 200) balance = bResult.body;
        } catch {}

        accounts.push({
          id: acct.id,
          name: acct.name,
          type: acct.type,
          subtype: acct.subtype,
          institution: acct.institution?.name || "Unknown",
          balance: balance?.available ?? balance?.ledger ?? null,
          currency: acct.currency || "USD",
        });
      }
    } catch (e) {
      console.error("Accounts error:", e.message);
    }
  }

  res.json({ accounts });
});

// ---- POST /transactions ----
// Body: { enrollments: [{ accessToken }], accountId? }
app.post("/transactions", requireSecret, async (req, res) => {
  const { enrollments, accountId } = req.body;
  if (!enrollments?.length) return res.json({ transactions: [] });

  let transactions = [];

  for (const enr of enrollments) {
    try {
      const acctResult = await tellerRequest("/accounts", enr.accessToken);
      if (acctResult.status !== 200) continue;

      for (const acct of acctResult.body) {
        if (accountId && acct.id !== accountId) continue;

        const txResult = await tellerRequest(`/accounts/${acct.id}/transactions`, enr.accessToken);
        if (txResult.status !== 200) continue;

        for (const tx of txResult.body) {
          transactions.push({
            id: tx.id,
            date: tx.date,
            description: tx.description,
            amount: parseFloat(tx.amount),
            type: tx.type,
            category: tx.details?.category || null,
            account: acct.name,
            institution: acct.institution?.name || "Unknown",
            status: tx.status,
          });
        }
      }
    } catch (e) {
      console.error("Transactions error:", e.message);
    }
  }

  transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json({ transactions });
});

app.listen(PORT, () => {
  console.log(`Teller proxy running on port ${PORT}`);
});
