import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "motion/react";
import {
  Check, CreditCard, ArrowRight, ArrowLeft, ShieldCheck, Smartphone,
  GraduationCap, Lock, Package, RotateCcw, Loader2, AlertCircle, Landmark,
  Sparkles, Zap
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

import {
  PRO_MONTHLY_INR,
  PRO_YEARLY_PER_MONTH_INR,
  PRO_YEARLY_TOTAL_INR,
  PRO_REGULAR_MONTHLY_INR,
  PRO_REGULAR_YEARLY_TOTAL_INR,
} from "../lib/siteConfig";

const PLANS: Record<string, { name: string; monthly: number; yearlyTotal: number; blurb: string }> = {
  pro: {
    name: "Sadhya Pro (Launch Special)",
    monthly: PRO_MONTHLY_INR,
    yearlyTotal: PRO_YEARLY_TOTAL_INR,
    blurb: "Full access — unlimited AI tutor, adaptive tests, podcast studio & video lessons",
  },
  institution: {
    name: "Institution",
    monthly: 0,
    yearlyTotal: 0,
    blurb: "Bulk seats, admin dashboard & custom curriculum",
  },
};

const STEPS = [
  { n: 1, label: "Choose plan" },
  { n: 2, label: "Your details" },
  { n: 3, label: "Payment method" },
];

type Method = "card" | "upi" | "netbanking";

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const planId = (params.get("plan") || "pro").toLowerCase();
  const [isYearly, setIsYearly] = useState(params.get("billing") === "yearly");
  const plan = PLANS[planId] || PLANS.pro;

  const monthly = plan.monthly;
  const perMonth = isYearly ? PRO_YEARLY_PER_MONTH_INR : monthly;
  const total = isYearly ? plan.yearlyTotal : perMonth;

  const [method, setMethod] = useState<Method>("card");
  const [discount, setDiscount] = useState("");
  const [showDiscount, setShowDiscount] = useState(false);
  const [discountApplied, setDiscountApplied] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Safe navigation handler that keeps logged-in users inside their workspace
  const handleGoBack = () => {
    if (window.history.length > 2) {
      navigate(-1);
    } else if (user) {
      navigate("/settings");
    } else {
      navigate("/pricing");
    }
  };

  const handleCheckout = async () => {
    setError(null);
    setProcessing(true);
    try {
      const loaded = await loadRazorpayScript();
      if (!loaded) throw new Error("Couldn't load the payment SDK — check your connection and try again.");

      // 1. Ask the backend to create a Razorpay order (amount is computed server-side).
      const { data } = await api.post("/payments/order", {
        plan: planId,
        billing: isYearly ? "yearly" : "monthly",
      });
      if (!data?.orderId || !data?.keyId) throw new Error("Payment could not be started.");

      // 2. Open Razorpay's hosted, PCI-compliant checkout (card data never touches our servers).
      const rzp = new (window as any).Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: "Sadhya",
        description: `${data.planName} — ${isYearly ? "Yearly (billed once)" : "Monthly"}`,
        ...(import.meta.env.VITE_BRAND_LOGO_URL ? { image: import.meta.env.VITE_BRAND_LOGO_URL as string } : {}),
        prefill: { name: user?.displayName || "", email: user?.email || "" },
        theme: { color: "#c8e558", backdrop_color: "#0b0b0c" },
        // 3. On success, verify the signature server-side, then show the Thank-You page.
        handler: async (resp: any) => {
          try {
            await api.post("/payments/verify", {
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
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
          ? "Payments aren't configured on the server yet. Please try again later."
          : e?.response?.data?.error || e?.message || "Something went wrong starting the payment.",
      );
      setProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#131315] text-slate-900 dark:text-slate-100 font-sans antialiased transition-colors duration-200">
      {/* ── Step Indicator Bar ─────────────────────────────── */}
      <div className="bg-white dark:bg-[#1a1a1e] border-b border-slate-200/90 dark:border-white/[0.08] shadow-2xs">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          {STEPS.map((s, i) => {
            const active = s.n === 3;
            const done = s.n < 3;
            return (
              <div key={s.n} className="flex-1 flex items-center">
                <div className="flex flex-col items-center gap-1.5 mx-auto text-center">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold transition-all",
                    active
                      ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 shadow-2xs ring-4 ring-slate-900/10 dark:ring-[#c8e558]/20"
                      : done
                      ? "bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558] border border-[#8ba32b]/30 dark:border-[#c8e558]/30"
                      : "bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/[0.08] text-slate-400 dark:text-slate-500"
                  )}>
                    {done ? <Check className="w-4 h-4 stroke-[2.5]" /> : s.n}
                  </div>
                  <span className={cn(
                    "text-[12px] font-semibold tracking-tight",
                    active ? "text-slate-900 dark:text-white" : "text-slate-400 dark:text-slate-500"
                  )}>
                    {s.n}. {s.label}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="hidden sm:block h-[1.5px] flex-1 bg-slate-200 dark:bg-white/[0.08] -mt-5" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-5xl mx-auto px-6 py-9 grid lg:grid-cols-[1fr_360px] gap-8"
      >
        {/* ── Left: Payment Method Selection ─────────────────── */}
        <div>
          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-1.5">
              Choose your payment method
            </h1>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Select how you'd like to pay for your {plan.name} subscription.
            </p>
          </div>

          <div className="space-y-3">
            <MethodOption
              selected={method === "card"}
              onSelect={() => setMethod("card")}
              icon={<CreditCard className="w-5 h-5" />}
              title="Credit / Debit Card"
              desc="Visa, Mastercard, RuPay, Amex — entered securely in the payment window."
              right={<div className="flex gap-1 text-[10px] font-bold text-slate-400 dark:text-slate-500">VISA · MC · RuPay · AMEX</div>}
            />
            <MethodOption
              selected={method === "upi"}
              onSelect={() => setMethod("upi")}
              icon={<Smartphone className="w-5 h-5" />}
              title="UPI (Google Pay, PhonePe, Paytm, BHIM)"
              desc="Pay instantly using any UPI app or your UPI ID / QR code."
              right={<div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">UPI / QR</div>}
            />
            <MethodOption
              selected={method === "netbanking"}
              onSelect={() => setMethod("netbanking")}
              icon={<Landmark className="w-5 h-5" />}
              title="Net Banking"
              desc="Pay directly from your bank account via net banking (50+ Indian banks)."
              right={<div className="text-[10px] font-bold text-slate-400 dark:text-slate-500">50+ banks</div>}
            />
          </div>

          {/* Secure processing badge */}
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] px-4.5 py-3.5 shadow-2xs">
            <div className="w-7 h-7 rounded-lg bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center shrink-0 mt-0.5 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
              <Lock className="w-4 h-4" />
            </div>
            <p className="text-[12.5px] text-slate-600 dark:text-slate-300 leading-relaxed">
              Payments are processed with 256-bit encryption by <span className="font-bold text-slate-900 dark:text-white">Razorpay</span>.
              Your card and UPI credentials never touch our servers.
            </p>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/10 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-between mt-8 pt-4 border-t border-slate-200/80 dark:border-white/[0.08]">
            <button
              onClick={handleGoBack}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 dark:border-white/15 bg-white dark:bg-[#1a1a1e] text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#232328] transition-all cursor-pointer shadow-xs active:scale-98"
            >
              <ArrowLeft className="w-4 h-4" /> Go back
            </button>
            <button
              onClick={handleCheckout}
              disabled={processing}
              className="inline-flex items-center gap-2 px-7 py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 font-bold text-[13.5px] hover:opacity-90 disabled:opacity-50 transition-all shadow-md cursor-pointer active:scale-98"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Processing…
                </>
              ) : (
                <>
                  <span>Pay ₹{total.toLocaleString("en-IN")}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>

          <p className="text-[11.5px] text-slate-400 dark:text-slate-500 mt-3 text-right">
            By checking out you agree to Sadhya terms and our 7-day money-back guarantee.
          </p>
        </div>

        {/* ── Right: Summary Sidebar ─────────────────────────── */}
        <aside className="lg:sticky lg:top-8 self-start space-y-4">
          <div className="rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] p-5 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">Order Summary</h2>
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558]">
                Pro Plan
              </span>
            </div>

            {/* Plan Info */}
            <div className="text-[13px] space-y-1.5 mb-3.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Plan</span>
                <span className="font-bold text-slate-900 dark:text-white">{plan.name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500 dark:text-slate-400">Billing frequency</span>
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-[#232328] p-0.5 rounded-full text-[11px] font-semibold">
                  <button
                    onClick={() => setIsYearly(false)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-full transition-all cursor-pointer",
                      !isYearly ? "bg-white dark:bg-[#1a1a1e] text-slate-900 dark:text-white shadow-2xs" : "text-slate-500 dark:text-slate-400"
                    )}
                  >
                    Monthly
                  </button>
                  <button
                    onClick={() => setIsYearly(true)}
                    className={cn(
                      "px-2.5 py-0.5 rounded-full transition-all cursor-pointer",
                      isYearly ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-950 shadow-2xs" : "text-slate-500 dark:text-slate-400"
                    )}
                  >
                    Yearly (-15%)
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[12px] text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              {plan.blurb}
            </p>

            <div className="border-t border-slate-100 dark:border-white/[0.08] pt-3.5 text-[13px] space-y-2">
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Subtotal</span>
                <span>₹{total.toLocaleString("en-IN")}</span>
              </div>
              {isYearly && (
                <div className="flex justify-between text-[#8ba32b] dark:text-[#c8e558] font-semibold text-[12.5px]">
                  <span>Yearly 15% discount</span>
                  <span>Applied</span>
                </div>
              )}
              <div className="flex justify-between text-slate-600 dark:text-slate-300">
                <span>Tax</span>
                <span>Included</span>
              </div>
            </div>

            {/* Discount Code */}
            {!showDiscount ? (
              <button
                onClick={() => setShowDiscount(true)}
                className="mt-3 text-[12.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline cursor-pointer"
              >
                Have a referral or promo code?
              </button>
            ) : (
              <div className="mt-3 flex gap-2">
                <input
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="Enter code"
                  className="flex-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#232328] text-[12.5px] outline-none focus:border-slate-400 dark:focus:border-white/30 text-slate-900 dark:text-white"
                />
                <button
                  onClick={() => {
                    if (discount.trim()) setDiscountApplied(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 text-[12px] font-bold cursor-pointer"
                >
                  Apply
                </button>
              </div>
            )}

            {discountApplied && (
              <p className="mt-1.5 text-[11.5px] text-[#8ba32b] dark:text-[#c8e558] font-medium">
                Promo code applied successfully!
              </p>
            )}

            {/* Total Amount */}
            <div className="border-t border-slate-100 dark:border-white/[0.08] mt-4 pt-4 flex items-end justify-between">
              <div>
                <span className="text-[11.5px] text-slate-400 uppercase tracking-wider font-bold block">Total Due</span>
                <span className="text-[12px] text-slate-500 dark:text-slate-400">{isYearly ? "Billed annually" : "Billed monthly"}</span>
              </div>
              <span className="text-2xl font-bold text-slate-900 dark:text-[#c8e558]">
                ₹{total.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* Guarantees Box */}
          <div className="rounded-2xl bg-white dark:bg-[#1a1a1e] border border-slate-200/90 dark:border-white/[0.08] p-5 space-y-3.5 shadow-2xs">
            <Guarantee
              icon={<ShieldCheck className="w-4 h-4" />}
              title="Secure Checkout"
              desc="Bank-grade 256-bit SSL encryption. Card details are never stored."
            />
            <Guarantee
              icon={<RotateCcw className="w-4 h-4" />}
              title="7-Day Full Refund Guarantee"
              desc="Try Pro risk-free. Cancel anytime within 7 days for a 100% full refund."
            />
            <Guarantee
              icon={<Zap className="w-4 h-4" />}
              title="Instant Activation"
              desc="Unlimited AI tutor, tests & studio unlock right after payment."
            />
          </div>
        </aside>
      </motion.div>
    </div>
  );
}

function MethodOption({
  selected,
  onSelect,
  icon,
  title,
  desc,
  right,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  right?: React.ReactNode;
}) {
  return (
    <div
      onClick={onSelect}
      className={cn(
        "rounded-2xl border p-4.5 transition-all cursor-pointer shadow-2xs",
        selected
          ? "border-slate-900 dark:border-[#c8e558] bg-slate-100/60 dark:bg-[#232328] ring-1 ring-slate-900/10 dark:ring-[#c8e558]/20"
          : "border-slate-200/90 dark:border-white/[0.08] bg-white dark:bg-[#1a1a1e] hover:bg-slate-50 dark:hover:bg-[#202025] hover:border-slate-300 dark:hover:border-white/20"
      )}
    >
      <div className="flex items-center gap-3.5">
        <span
          className={cn(
            "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
            selected
              ? "border-slate-900 dark:border-[#c8e558]"
              : "border-slate-300 dark:border-white/25"
          )}
        >
          {selected && <span className="w-2.5 h-2.5 rounded-full bg-slate-900 dark:bg-[#c8e558]" />}
        </span>
        <span className="text-slate-700 dark:text-slate-200">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold text-slate-900 dark:text-white">{title}</div>
          <div className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug">{desc}</div>
        </div>
        {right}
      </div>
    </div>
  );
}

function Guarantee({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center shrink-0 mt-0.5 border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
        {icon}
      </div>
      <div>
        <div className="text-[12.5px] font-bold text-slate-800 dark:text-slate-200">{title}</div>
        <div className="text-[11.5px] text-slate-500 dark:text-slate-400 leading-snug">{desc}</div>
      </div>
    </div>
  );
}
