import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CheckCircle2, Mail, ArrowRight, Bot, Target, CalendarCheck, Printer } from "lucide-react";
import { api } from "../lib/api/client";
import { useAuth } from "../lib/AuthContext";

const NEXT_STEPS = [
  "Start a session with your GraphRAG AI tutor",
  "Take an adaptive mock test to find weak areas",
  "Build a personalised study plan to exam day",
];

interface Receipt {
  paymentId: string;
  amountRupees: number | null;
  planName: string;
  billing: string;
  method: string | null;
  at: number | null;
}

export default function PaymentSuccess() {
  const { user } = useAuth();
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  // Pull the latest subscription so the printable receipt reflects the real payment.
  useEffect(() => {
    if (!user) return;
    api.get("/payments/subscription").then((r) => {
      const s = r.data?.subscription;
      if (s) {
        setReceipt({
          paymentId: s.paymentId || s.orderId || "—",
          amountRupees: s.amountRupees ?? null,
          planName: s.planName || "Scholarly Pro",
          billing: s.billing || "monthly",
          method: s.method || null,
          at: s.activatedAt || Date.now(),
        });
      }
    }).catch(() => {});
  }, [user]);

  // Decorative barcode bars for the printed receipt (stable per mount).
  const bars = useMemo(() => Array.from({ length: 46 }, () => 1 + Math.floor(Math.random() * 3)), []);

  const printReceipt = () => {
    const w = window.open("", "_blank", "width=460,height=780");
    if (!w) { alert("Allow pop-ups to print the receipt."); return; }
    const name = user?.displayName || "Scholarly Student";
    const email = user?.email || "";
    const amountStr = receipt?.amountRupees != null ? `₹${Number(receipt.amountRupees).toLocaleString("en-IN")}` : "—";
    const dateStr = receipt?.at
      ? new Date(receipt.at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : new Date().toLocaleString();
    const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const barsHtml = bars.map((bw, i) => `<span style="display:inline-block;width:${bw}px;height:${i % 6 === 0 ? "100%" : "82%"};background:#0f172a"></span>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Receipt</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,'Segoe UI',Roboto,Arial,sans-serif}
        body{background:#eef2f7;padding:28px;display:flex;justify-content:center}
        .t{background:#fff;width:360px;border-radius:22px;padding:32px 28px;box-shadow:0 10px 40px rgba(0,0,0,.08)}
        .h{text-align:center;margin-bottom:22px}
        .emoji{font-size:34px}
        .h h1{font-size:20px;font-weight:700;color:#0f172a;margin-top:8px}
        .h p{font-size:13px;color:#94a3b8;margin-top:4px}
        .sep{border-top:2px dashed #e2e8f0;margin:18px 0}
        .row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px}
        .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;font-weight:600;margin-bottom:4px}
        .val{font-size:15px;font-weight:700;color:#0f172a;word-break:break-all}
        .amt{font-size:15px;font-weight:700;color:#0f172a;text-align:right}
        .pm{display:flex;align-items:center;gap:12px;background:#f1f5f9;border-radius:14px;padding:12px 14px;margin-top:6px}
        .pm .ic{width:36px;height:36px;border-radius:9px;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px}
        .pm .nm{font-size:14px;font-weight:600;color:#0f172a}
        .pm .sub{font-size:12px;color:#64748b}
        .bc{display:flex;align-items:flex-end;justify-content:center;gap:2px;height:56px;margin-top:24px}
        .cap{text-align:center;font-size:11px;color:#94a3b8;letter-spacing:.2em;margin-top:8px}
      </style></head><body>
      <div class="t">
        <div class="h"><div class="emoji">🎉</div><h1>Payment successful</h1><p>Your Scholarly Pro subscription is active</p></div>
        <div class="sep"></div>
        <div class="row"><div><div class="lbl">Payment ID</div><div class="val">${esc(receipt?.paymentId || "—")}</div></div><div><div class="lbl">Amount</div><div class="amt">${esc(amountStr)}</div></div></div>
        <div class="row"><div><div class="lbl">Date &amp; time</div><div class="val" style="font-size:14px">${esc(dateStr)}</div></div><div><div class="lbl">Billing</div><div class="amt" style="text-transform:capitalize">${esc(receipt?.billing || "monthly")}</div></div></div>
        <div class="pm"><div class="ic">S</div><div><div class="nm">${esc(receipt?.planName || "Scholarly Pro")}</div><div class="sub">Razorpay${receipt?.method ? " · " + esc(String(receipt.method).toUpperCase()) : ""} · ${esc(email)}</div></div></div>
        <div class="sep"></div>
        <div class="bc">${barsHtml}</div>
        <div class="cap">SCHOLARLY · ${esc(name.toUpperCase())}</div>
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-neutral-900 dark:text-neutral-100 font-sans antialiased flex items-center justify-center px-6 py-16">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md text-center"
      >
        {/* Success icon */}
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 220, damping: 16 }}
          className="w-20 h-20 rounded-3xl bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center mx-auto mb-7"
        >
          <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" strokeWidth={2} />
        </motion.div>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Thank You!</h1>
        <p className="text-[15px] text-slate-500 dark:text-gray-400 mb-8">Your payment was successful and your Pro plan is now active.</p>

        {/* Check inbox card */}
        <div className="rounded-2xl bg-gradient-to-b from-indigo-50 to-white dark:from-indigo-500/10 dark:to-transparent border border-indigo-100 dark:border-white/10 p-6 mb-8">
          <div className="w-12 h-12 rounded-xl bg-white dark:bg-white/10 shadow-sm flex items-center justify-center mx-auto mb-3">
            <Mail className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-[16px] font-bold mb-1.5">Check your inbox</h2>
          <p className="text-[13.5px] text-slate-500 dark:text-gray-400 leading-relaxed">
            Your payment receipt and getting-started guide are on their way — expect them within{" "}
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">3 to 5 minutes</span>.
          </p>
          {/* Print receipt option */}
          <button
            onClick={printReceipt}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-white/5 text-[13px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
          >
            <Printer className="w-4 h-4" /> Print receipt
          </button>
        </div>

        {/* What's next */}
        <div className="text-left mb-8">
          <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-gray-500 text-center mb-4">What's next?</div>
          <ul className="space-y-3">
            {NEXT_STEPS.map((step, i) => (
              <li key={i} className="flex items-center gap-3 text-[13.5px] text-slate-600 dark:text-gray-300">
                <span className="w-6 h-6 rounded-full bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[12px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                {step}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/dashboard" className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[13.5px] font-semibold hover:opacity-90 transition-opacity">
            Go to Dashboard <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/chat" className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full border border-slate-200 dark:border-white/15 text-[13.5px] font-semibold text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
            <Bot className="w-4 h-4" /> Open AI Tutor
          </Link>
        </div>

        {/* Small quick-links row */}
        <div className="flex items-center justify-center gap-6 mt-8 text-slate-400 dark:text-gray-500">
          <Link to="/tests" className="inline-flex items-center gap-1.5 text-[12.5px] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"><Target className="w-3.5 h-3.5" /> Mock tests</Link>
          <Link to="/planner" className="inline-flex items-center gap-1.5 text-[12.5px] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"><CalendarCheck className="w-3.5 h-3.5" /> Study plan</Link>
        </div>
      </motion.div>
    </div>
  );
}
