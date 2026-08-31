import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "motion/react";
import { CheckCircle2, Mail, ArrowRight, Bot, Target, CalendarCheck, Printer, Sparkles, Check } from "lucide-react";
import { api } from "../lib/api/client";
import { useAuth } from "../lib/AuthContext";
import { notifyEntitlementChanged } from "../hooks/usePlan";

const NEXT_STEPS = [
  "Start an interactive session with your AI tutor",
  "Take an adaptive mock test to identify weak areas",
  "Generate a personalized daily study plan to exam day",
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

  // Pull the latest subscription so the printable receipt reflects the real payment, and tell
  // the rest of the app the entitlement changed so the sidebar/header stop offering an upgrade
  // the user has just bought — without making them reload the page.
  useEffect(() => {
    if (!user) return;
    notifyEntitlementChanged();
    api.get("/payments/subscription").then((r) => {
      const s = r.data?.subscription;
      if (s) {
        setReceipt({
          paymentId: s.paymentId || s.orderId || "—",
          amountRupees: s.amountRupees ?? null,
          planName: s.planName || "Sadhya Pro",
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
    const name = user?.displayName || "Sadhya Student";
    const email = user?.email || "";
    const amountStr = receipt?.amountRupees != null ? `₹${Number(receipt.amountRupees).toLocaleString("en-IN")}` : "—";
    const dateStr = receipt?.at
      ? new Date(receipt.at).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : new Date().toLocaleString();
    const esc = (s: string) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));
    const barsHtml = bars.map((bw, i) => `<span style="display:inline-block;width:${bw}px;height:${i % 6 === 0 ? "100%" : "82%"};background:#0f172a"></span>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Payment Receipt</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif}
        body{background:#f1f5f9;padding:28px;display:flex;justify-content:center}
        .t{background:#fff;width:380px;border-radius:24px;padding:32px 28px;box-shadow:0 12px 40px rgba(0,0,0,.08);border:1px solid #e2e8f0}
        .h{text-align:center;margin-bottom:20px}
        .logo-img{width:44px;height:44px;border-radius:10px;object-fit:contain;margin-bottom:12px;border:1px solid #e2e8f0}
        .h h1{font-size:20px;font-weight:800;color:#0f172a;letter-spacing:-0.4px}
        .h h1 span{color:#65a30d}
        .h p{font-size:13px;color:#64748b;margin-top:4px}
        .badge{display:inline-block;background:#dcfce7;color:#166534;font-size:10.5px;font-weight:700;padding:3px 10px;border-radius:999px;margin-top:8px;text-transform:uppercase;letter-spacing:0.5px}
        .sep{border-top:1.5px dashed #e2e8f0;margin:18px 0}
        .row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
        .lbl{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;font-weight:700;margin-bottom:3px}
        .val{font-size:14px;font-weight:700;color:#0f172a;word-break:break-all}
        .amt{font-size:15px;font-weight:800;color:#0f172a;text-align:right}
        .pm{display:flex;align-items:center;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;padding:12px 14px;margin-top:6px}
        .pm .ic{width:36px;height:36px;border-radius:9px;background:#0f172a;color:#c8e558;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:13px}
        .pm .nm{font-size:14px;font-weight:700;color:#0f172a}
        .pm .sub{font-size:11.5px;color:#64748b}
        .bc{display:flex;align-items:flex-end;justify-content:center;gap:2px;height:44px;margin-top:20px}
        .cap{text-align:center;font-size:10.5px;color:#94a3b8;letter-spacing:.15em;margin-top:8px;font-weight:600}
      </style></head><body>
      <div class="t">
        <div class="h">
          <img src="https://sadhya.app/sadhya-logo-512x512.png" class="logo-img" alt="Sadhya" onerror="this.style.display='none'" />
          <h1>Sadhya<span>.</span></h1>
          <p>Official Payment Receipt &amp; Confirmation</p>
          <span class="badge">✓ Paid &amp; Active</span>
        </div>
        <div class="sep"></div>
        <div class="row"><div><div class="lbl">Payment ID</div><div class="val" style="font-family:monospace;font-size:12.5px">${esc(receipt?.paymentId || "—")}</div></div><div><div class="lbl">Total Paid</div><div class="amt">${esc(amountStr)}</div></div></div>
        <div class="row"><div><div class="lbl">Date &amp; Time</div><div class="val" style="font-size:13px">${esc(dateStr)}</div></div><div><div class="lbl">Billing</div><div class="amt" style="text-transform:capitalize;font-size:13px">${esc(receipt?.billing || "monthly")}</div></div></div>
        <div class="pm">
          <div class="ic">⚡</div>
          <div>
            <div class="nm">${esc(receipt?.planName || "Sadhya Pro")}</div>
            <div class="sub">Razorpay${receipt?.method ? " · " + esc(String(receipt.method).toUpperCase()) : ""} · ${esc(email)}</div>
          </div>
        </div>
        <div class="sep"></div>
        <div class="bc">${barsHtml}</div>
        <div class="cap">SADHYA TECHNOLOGIES · ${esc(name.toUpperCase())}</div>
      </div>
      <script>window.onload=function(){window.print();}</script>
      </body></html>`);
    w.document.close();
  };

  return (
    <div className="min-h-screen bg-[#fafbfc] dark:bg-[#0b0b0c] text-slate-900 dark:text-white font-sans antialiased flex items-center justify-center px-6 py-16">
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
          className="w-20 h-20 rounded-3xl bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] border border-[#8ba32b]/25 dark:border-[#c8e558]/25 flex items-center justify-center mx-auto mb-7 shadow-xs"
        >
          <Check className="w-10 h-10 stroke-[2.5]" />
        </motion.div>

        <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2 text-slate-900 dark:text-white">
          Payment Successful!
        </h1>
        <p className="text-[14.5px] text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
          Your payment has been verified and your Sadhya Pro subscription is now active.
        </p>

        {/* Check inbox card */}
        <div className="rounded-2xl bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 p-6 mb-8 shadow-2xs">
          <div className="w-11 h-11 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center mx-auto mb-3 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
            <Mail className="w-5 h-5" />
          </div>
          <h2 className="text-[16px] font-bold text-slate-900 dark:text-white mb-1">Check your inbox</h2>
          <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Your official tax receipt and Pro getting-started guide have been dispatched to{" "}
            <span className="font-bold text-slate-800 dark:text-slate-200">{user?.email || "your registered email"}</span>.
          </p>
          {/* Print receipt option */}
          <button
            onClick={printReceipt}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full border border-slate-200 dark:border-white/15 bg-slate-50 dark:bg-white/5 text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-all cursor-pointer shadow-xs active:scale-98"
          >
            <Printer className="w-4 h-4" /> Print receipt
          </button>
        </div>

        {/* What's next */}
        <div className="text-left mb-8 bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl p-5 shadow-2xs">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
            <span>What to do next</span>
          </div>
          <ul className="space-y-2.5">
            {NEXT_STEPS.map((step, i) => (
              <li key={i} className="flex items-center gap-3 text-[13px] text-slate-700 dark:text-slate-300">
                <span className="w-5 h-5 rounded-full bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] text-[11px] font-bold flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Return to Dashboard */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/dashboard"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 text-[13.5px] font-bold hover:opacity-90 transition-all shadow-md active:scale-98"
          >
            <span>Go to Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            to="/chat"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full border border-slate-200 dark:border-white/15 text-[13.5px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-all shadow-xs cursor-pointer"
          >
            <Bot className="w-4 h-4" /> Open AI Tutor
          </Link>
        </div>

        {/* Small quick-links row */}
        <div className="flex items-center justify-center gap-6 mt-8 text-slate-400 dark:text-slate-500">
          <Link to="/tests" className="inline-flex items-center gap-1.5 text-[12.5px] hover:text-[#8ba32b] dark:hover:text-[#c8e558] transition-colors">
            <Target className="w-3.5 h-3.5" /> Mock tests
          </Link>
          <Link to="/planner" className="inline-flex items-center gap-1.5 text-[12.5px] hover:text-[#8ba32b] dark:hover:text-[#c8e558] transition-colors">
            <CalendarCheck className="w-3.5 h-3.5" /> Study plan
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
