import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  Check, CreditCard, ArrowRight, ArrowLeft, ShieldCheck, Smartphone,
  GraduationCap, Lock, Package, RotateCcw, Loader2, AlertCircle, Landmark,
} from "lucide-react";
import { cn } from "../lib/utils";
import { api } from "../lib/api/client";
import { useAuth } from "../lib/AuthContext";

/** Loads the Razorpay Checkout SDK once; resolves false if it fails to load. */
function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

const PLANS: Record<string, { name: string; monthly: number; blurb: string }> = {
  pro: { name: "Scholarly Pro", monthly: 499, blurb: "Full package — unlimited AI tutor, tests & studio" },
  institution: { name: "Institution", monthly: 0, blurb: "Bulk seats, admin dashboard & custom curriculum" },
};

const STEPS = [
  { n: 1, label: "Choose your plan" },
  { n: 2, label: "Your details" },
  { n: 3, label: "Payment method" },
];

type Method = "card" | "upi" | "netbanking";

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();

  const planId = (params.get("plan") || "pro").toLowerCase();
  const yearly = params.get("billing") === "yearly";
  const plan = PLANS[planId] || PLANS.pro;

  const monthly = plan.monthly;
  const perMonth = yearly ? Math.round(monthly * 0.85) : monthly;
  const total = yearly ? perMonth * 12 : perMonth;

  const { user } = useAuth();
  const [method, setMethod] = useState<Method>("card");
  const [discount, setDiscount] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCheckout = async () => {
    setError(null);
    setProcessing(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Couldn't load the payment SDK — check your connection and try again.");

      // 1. Ask the backend to create a Razorpay order (amount is computed server-side).
      const { data } = await api.post("/payments/order", {
        plan: planId,
        billing: yearly ? "yearly" : "monthly",
      });
      if (!data?.orderId || !data?.keyId) throw new Error("Payment could not be started.");

      // 2. Open Razorpay's hosted, PCI-compliant checkout (card data never touches our servers).
      //    Branded with our name, accent colour and (optional) logo. The selected method just
      //    preselects a tab; the user completes payment inside Razorpay's secure window.
      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: "Scholarly",
        description: `${data.planName} — ${data.billing === "yearly" ? "Yearly (billed once)" : "Monthly"}`,
        ...(import.meta.env.VITE_BRAND_LOGO_URL ? { image: import.meta.env.VITE_BRAND_LOGO_URL as string } : {}),
        prefill: { name: user?.displayName || "", email: user?.email || "" },
        theme: { color: "#4f46e5", backdrop_color: "#0b0b0c" },
        // 3. On success, verify the signature server-side, then show the Thank-You page.
        handler: async (resp: any) => {
          try {
            await api.post("/payments/verify", {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            // Must match the route registered in App.tsx — /checkout/success is not a
            // route, so navigating there dropped the user on a blank screen immediately
            // after a successful payment.
            navigate("/payment-success");
          } catch {
            setError("Payment received — we're confirming it now. Your Pro access will activate shortly.");
            setProcessing(false);
          }
        },
        modal: { ondismiss: () => setProcessing(false) },
      });
      rzp.on("payment.failed", (r: any) => {
        setError(r?.error?.description || "Payment failed. Please try again.");
        setProcessing(false);
      });
      rzp.open();
    } catch (e: any) {
      const status = e?.response?.status;
      setError(
        status === 503
          ? "Payments aren't set up on the server yet. Please try again later."
          : e?.response?.data?.error || e?.message || "Something went wrong starting the payment.",
      );
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0b0b0c] text-neutral-900 dark:text-neutral-100 font-sans antialiased">
      {/* Step indicator */}
      <div className="bg-slate-50 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-6 flex items-center justify-between">
          {STEPS.map((s, i) => {
            const active = s.n === 3;
            const done = s.n < 3;
            return (
              <div key={s.n} className="flex-1 flex items-center">
                <div className="flex flex-col items-center gap-2 mx-auto text-center">
                  <div className={cn(
                    "w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold border-2 transition-colors",
                    active ? "bg-indigo-600 border-indigo-600 text-white"
                      : done ? "bg-emerald-500 border-emerald-500 text-white"
                      : "bg-white dark:bg-transparent border-slate-300 dark:border-white/20 text-slate-400"
                  )}>
                    {done ? <Check className="w-4 h-4" /> : s.n}
                  </div>
                  <span className={cn("text-[12.5px] font-medium", active ? "text-neutral-900 dark:text-white" : "text-slate-400 dark:text-gray-500")}>
                    {s.n}. {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && <div className="hidden sm:block h-[2px] flex-1 bg-slate-200 dark:bg-white/10 -mt-6" />}
              </div>
            );
          })}
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
        className="max-w-5xl mx-auto px-6 py-10 grid lg:grid-cols-[1fr_360px] gap-10">
        {/* ── Left: payment method ─────────────────────────── */}
        <div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight mb-6">Choose your payment method</h1>

          <div className="space-y-3">
            <MethodOption
              selected={method === "card"} onSelect={() => setMethod("card")}
              icon={<CreditCard className="w-5 h-5" />}
              title="Credit / Debit Card"
              desc="Visa, Mastercard, RuPay, Amex — entered securely in the payment window."
              right={<div className="flex gap-1.5 text-[10px] font-bold text-slate-400">VISA · MC · RuPay · AMEX</div>}
            />
            <MethodOption
              selected={method === "upi"} onSelect={() => setMethod("upi")}
              icon={<Smartphone className="w-5 h-5" />}
              title="UPI"
              desc="Pay instantly with GPay, PhonePe, Paytm or any UPI app."
              right={<div className="text-[10px] font-bold text-slate-400">UPI</div>}
            />
            <MethodOption
              selected={method === "netbanking"} onSelect={() => setMethod("netbanking")}
              icon={<Landmark className="w-5 h-5" />}
              title="Net Banking"
              desc="Pay directly from your bank account via net banking."
              right={<div className="text-[10px] font-bold text-slate-400">50+ banks</div>}
            />
          </div>

          <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-4 py-3">
            <Lock className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[12.5px] text-slate-500 dark:text-gray-400 leading-relaxed">
              Payments are processed securely by <span className="font-semibold text-slate-700 dark:text-gray-200">Razorpay</span>.
              You'll enter your card / UPI / bank details in Razorpay's PCI-compliant window when you check out — they never touch our servers.
            </p>
          </div>

          {error && (
            <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Nav buttons */}
          <div className="flex items-center justify-between mt-8">
            <button onClick={() => navigate("/pricing")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 dark:border-white/15 text-[13.5px] font-semibold text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Go back
            </button>
            <button onClick={handleCheckout} disabled={processing}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-70 text-white text-[13.5px] font-semibold shadow-sm transition-colors">
              {processing ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</> : <>Pay ₹{total.toLocaleString("en-IN")} <ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
          <p className="text-[11.5px] text-slate-400 dark:text-gray-500 mt-3 text-right">
            By checking out you agree to our terms and money-back guarantee.
          </p>
        </div>

        {/* ── Right: summary ─────────────────────────── */}
        <aside className="lg:sticky lg:top-8 self-start">
          <div className="rounded-2xl border border-slate-200 dark:border-white/10 p-5">
            <h2 className="text-[17px] font-bold tracking-tight mb-4">Summary</h2>
            <div className="text-[13px] space-y-1 mb-4">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-gray-400">Plan</span><span className="font-semibold">{plan.name}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-gray-400">Billing</span><span className="font-semibold">{yearly ? "Yearly" : "Monthly"}</span></div>
            </div>
            <p className="text-[12px] text-slate-400 dark:text-gray-500 mb-4">{plan.blurb}</p>

            <div className="border-t border-slate-100 dark:border-white/5 pt-4 text-[13px] space-y-2">
              <div className="flex justify-between"><span className="text-slate-500 dark:text-gray-400">Subtotal</span><span>₹{total.toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-slate-500 dark:text-gray-400">Discount</span><span>₹0</span></div>
              {yearly && <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Yearly saving (15%)</span><span>Applied</span></div>}
            </div>

            {!showDiscount ? (
              <button onClick={() => setShowDiscount(true)} className="mt-3 text-[13px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
                Have a discount code?
              </button>
            ) : (
              <div className="mt-3 flex gap-2">
                <input value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="Enter code"
                  className="flex-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-[13px] outline-none focus:border-indigo-500" />
                <button className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-neutral-900 text-[13px] font-semibold">Apply</button>
              </div>
            )}

            <div className="border-t border-slate-100 dark:border-white/5 mt-4 pt-4 flex items-end justify-between">
              <span className="text-[13px] text-slate-500 dark:text-gray-400">Total {yearly ? "/ year" : "/ month"}</span>
              <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>

          {/* Guarantees */}
          <div className="mt-4 rounded-2xl bg-slate-50 dark:bg-white/[0.03] p-5 space-y-4">
            <Guarantee icon={<ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />} title="Secure payment"
              desc="Processed by a PCI-compliant provider. Your card details are encrypted and never stored by us." />
            <Guarantee icon={<RotateCcw className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />} title="7-day money-back guarantee"
              desc="Not satisfied? Cancel within 7 days for a full refund, no questions asked." />
            <Guarantee icon={<Package className="w-4 h-4 text-slate-500 dark:text-gray-400" />} title="Instant access"
              desc="Your Pro features unlock immediately after payment — nothing to install." />
          </div>
        </aside>
      </motion.div>

      <footer className="px-6 py-8 border-t border-black/5 dark:border-white/5">
        <div className="max-w-5xl mx-auto flex items-center gap-2 text-slate-400">
          <GraduationCap className="w-4 h-4" />
          <span className="text-[12.5px]">© {new Date().getFullYear()} Scholarly Education</span>
        </div>
      </footer>
    </div>
  );
}

function MethodOption({ selected, onSelect, icon, title, desc, right }: {
  selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; desc: string;
  right?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-2xl border p-4 transition-colors cursor-pointer",
      selected ? "border-emerald-400 dark:border-emerald-500/40 ring-1 ring-emerald-200 dark:ring-emerald-500/20 bg-emerald-50/30 dark:bg-emerald-500/[0.04]"
        : "border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20")}
      onClick={onSelect}>
      <div className="flex items-center gap-3">
        <span className={cn("w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
          selected ? "border-emerald-500" : "border-slate-300 dark:border-white/25")}>
          {selected && <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />}
        </span>
        <span className="text-slate-600 dark:text-gray-300">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-semibold text-neutral-900 dark:text-white">{title}</div>
          <div className="text-[12px] text-slate-500 dark:text-gray-400 leading-snug">{desc}</div>
        </div>
        {right}
      </div>
    </div>
  );
}

function Guarantee({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <div className="text-[13px] font-semibold text-neutral-800 dark:text-gray-200">{title}</div>
        <div className="text-[12px] text-slate-500 dark:text-gray-400 leading-snug">{desc}</div>
      </div>
    </div>
  );
}
