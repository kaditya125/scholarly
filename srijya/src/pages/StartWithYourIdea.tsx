import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Link } from 'react-router-dom';
import Field from '@/components/Field';
import { ArrowLeft, ArrowRight } from '@/components/Icons';
import HeaderMotif from '@/components/HeaderMotif';
import PageHeader from '@/components/PageHeader';
import { BUILDING, DISCOVERY_STEPS, HELP, STAGE } from '@/content/discovery';
import type { ChoiceQuestion } from '@/content/discovery';
import { submitEnquiry } from '@/lib/submitEnquiry';
import type { EnquiryOutcome } from '@/lib/submitEnquiry';
import { useSeo } from '@/lib/useSeo';
import { COMPANY } from '@/site.config';

type Status = 'idle' | 'sending' | EnquiryOutcome;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * The project discovery experience.
 *
 * One question per step, in the order a first conversation actually goes. It is
 * a form and does not pretend otherwise — but five short questions in sequence
 * produce a usable brief where one long page of inputs produces an abandoned tab
 * and a two-line "hi, interested in your services".
 *
 * Three rules it holds to:
 *
 *   - Nothing is submitted without an explicit final action. Advancing a step is
 *     not consent to send anything.
 *   - Every question can be answered "not sure yet". Someone certain of their
 *     requirements rarely needs this form, and punishing uncertainty filters out
 *     exactly the people worth hearing from.
 *   - No scoring, no qualification, no routing. The answers are shaped into a
 *     readable brief so the first reply can be about the problem.
 */
export default function StartWithYourIdea() {
  useSeo({
    title: `Start with your idea — ${COMPANY.name}`,
    description:
      'Tell us what you are trying to build. A few short questions, so the first reply can be about the problem rather than about scheduling a call to find out what it is.',
    path: '/start',
  });

  const [step, setStep] = useState(0);
  const [building, setBuilding] = useState('');
  const [stage, setStage] = useState('');
  const [about, setAbout] = useState('');
  const [help, setHelp] = useState<string[]>([]);
  const [contact, setContact] = useState({ name: '', email: '', company: '' });
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  const headingRef = useRef<HTMLHeadingElement>(null);
  const hasMoved = useRef(false);

  /* Focus follows the step, so a keyboard or screen-reader user lands on the new
     question rather than being left where the previous button used to be.
     Skipped on first render: stealing focus on page load is its own problem. */
  useEffect(() => {
    if (!hasMoved.current) {
      hasMoved.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const toggleHelp = (option: string) =>
    setHelp((current) =>
      current.includes(option) ? current.filter((o) => o !== option) : [...current, option]
    );

  const validateStep = (): string | null => {
    if (step === 0 && !building) return 'Pick the closest one. "Not sure yet" is a real answer.';
    if (step === 1 && !stage) return 'Pick whichever is closest to where you are.';
    if (step === 2 && about.trim().length < 12) return 'A sentence or two is enough to start from.';
    if (step === 3 && help.length === 0) return 'Choose at least one, or "Not sure yet".';
    if (step === 4) {
      if (!contact.name.trim()) return 'Please tell us your name.';
      if (!contact.email.trim()) return 'Please add an email address we can reply to.';
      if (!EMAIL_PATTERN.test(contact.email.trim()))
        return 'That does not look like a complete email address.';
    }
    return null;
  };

  const goNext = () => {
    const problem = validateStep();
    setError(problem);
    if (problem) return;
    setStep((s) => Math.min(s + 1, DISCOVERY_STEPS.length - 1));
  };

  const goBack = () => {
    setError(null);
    setStep((s) => Math.max(s - 1, 0));
  };

  const composeBrief = () =>
    [
      `Building: ${building}`,
      `Stage: ${stage}`,
      `Help wanted: ${help.join(', ')}`,
      '',
      'About the project:',
      about.trim(),
      '',
      `Name: ${contact.name.trim()}`,
      `Email: ${contact.email.trim()}`,
      contact.company.trim() ? `Company: ${contact.company.trim()}` : null,
    ]
      .filter((line) => line !== null)
      .join('\n');

  const handleSubmit = async () => {
    const problem = validateStep();
    setError(problem);
    if (problem) return;

    setStatus('sending');
    const suffix = contact.company.trim() ? ` (${contact.company.trim()})` : '';
    setStatus(
      await submitEnquiry({
        name: contact.name.trim(),
        email: contact.email.trim(),
        subject: `Project brief — ${contact.name.trim()}${suffix}`,
        body: composeBrief(),
        payload: { building, stage, help, about: about.trim(), company: contact.company.trim() },
      })
    );
  };

  if (status === 'sent' || status === 'handoff') {
    return (
      <>
        <PageHeader
          label="Project brief"
          title={
            status === 'sent' ? 'Thank you — your brief is with us.' : 'Your brief is ready to send.'
          }
          lede={
            status === 'sent'
              ? 'A person reads it. If it is something we can help with, you will hear back with questions about the problem rather than a proposal.'
              : 'Your mail client is open with the brief composed. Nothing has been sent until you send it.'
          }
      />
        <div className="container-tl py-16">
          <Link to="/" className="link-arrow">
            Back to the home page
            <ArrowRight />
          </Link>
        </div>
      </>
    );
  }

  /* `step` is clamped by goNext/goBack, so the fallback is unreachable — but
     the compiler cannot see that, and an assertion here would be a worse trade
     than a harmless default. Indexing the tuple with a literal is not optional. */
  const current = DISCOVERY_STEPS[step] ?? DISCOVERY_STEPS[0];
  const isLast = step === DISCOVERY_STEPS.length - 1;

  return (
    <>
      <PageHeader
        label="Start with your idea"
        title="Tell us what you're trying to build."
        lede={"Five short questions. There are no wrong answers, and “not sure yet” is one of them."}
        aside={<HeaderMotif name="transform" className="mx-auto max-w-[180px] text-accent" />}
      />

      <div className="container-tl py-14 md:py-20">
        <div className="grid gap-12 md:grid-cols-12 md:gap-10">
          {/* Progress. A real list, so it is navigable and announced rather than
              decorative, and it reads as a row on a phone instead of a column. */}
          <nav aria-label="Progress" className="md:col-span-3">
            <ol className="flex flex-wrap gap-x-6 gap-y-3 md:block md:space-y-4">
              {DISCOVERY_STEPS.map((s, index) => {
                const isCurrent = index === step;
                const isUpcoming = index > step;
                return (
                  <li key={s.id} className="flex items-baseline gap-3">
                    <span
                      className={`index-num ${isUpcoming ? 'opacity-40' : ''}`}
                      aria-hidden="true"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={
                        isCurrent
                          ? 'text-[0.9375rem] font-medium text-ink'
                          : 'text-[0.9375rem] text-ink-3'
                      }
                    >
                      {s.label}
                      {isCurrent ? <span className="sr-only"> (current step)</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="md:col-span-8">
            {/* Announced without moving the page or stealing focus. */}
            <p className="sr-only" aria-live="polite">
              Step {step + 1} of {DISCOVERY_STEPS.length}: {current.label}
            </p>

            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                if (isLast) void handleSubmit();
                else goNext();
              }}
            >
              {step === 0 ? (
                <Choices
                  question={BUILDING}
                  value={building}
                  onPick={(option) => {
                    setBuilding(option);
                    setError(null);
                  }}
                  headingRef={headingRef}
                />
              ) : null}

              {step === 1 ? (
                <Choices
                  question={STAGE}
                  value={stage}
                  onPick={(option) => {
                    setStage(option);
                    setError(null);
                  }}
                  headingRef={headingRef}
                />
              ) : null}

              {step === 2 ? (
                <div>
                  <h2 ref={headingRef} tabIndex={-1} className="display-3 max-w-[20ch] outline-none">
                    Tell us a little about it.
                  </h2>
                  <p className="body-text mt-5 max-w-[54ch]">
                    What the problem is, who it affects, anything already tried. Rough is fine —
                    this is the start of a conversation, not a specification.
                  </p>
                  <div className="mt-8 max-w-[60ch]">
                    <Field
                      name="about"
                      label="About the project"
                      value={about}
                      multiline
                      rows={7}
                      required
                      onChange={(_, value) => {
                        setAbout(value);
                        if (error) setError(null);
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {step === 3 ? (
                <Choices
                  question={HELP}
                  values={help}
                  onToggle={(option) => {
                    toggleHelp(option);
                    setError(null);
                  }}
                  headingRef={headingRef}
                />
              ) : null}

              {step === 4 ? (
                <div>
                  <h2 ref={headingRef} tabIndex={-1} className="display-3 max-w-[20ch] outline-none">
                    Who should we reply to?
                  </h2>
                  <div className="mt-8 max-w-[46ch] space-y-8">
                    <Field
                      name="name"
                      label="Name"
                      value={contact.name}
                      required
                      autoComplete="name"
                      onChange={(_, value) => setContact((c) => ({ ...c, name: value }))}
                    />
                    <Field
                      name="email"
                      label="Email"
                      type="email"
                      value={contact.email}
                      required
                      autoComplete="email"
                      onChange={(_, value) => setContact((c) => ({ ...c, email: value }))}
                    />
                    <Field
                      name="company"
                      label="Company"
                      value={contact.company}
                      hint="Optional"
                      autoComplete="organization"
                      onChange={(_, value) => setContact((c) => ({ ...c, company: value }))}
                    />
                  </div>
                  <p className="body-text mt-8 max-w-[54ch]">
                    Nothing is sent until you press the button below.
                  </p>
                </div>
              ) : null}

              {error ? (
                <p role="alert" className="mt-6 text-[0.8125rem] text-danger">
                  {error}
                </p>
              ) : null}

              {status === 'error' ? (
                <p role="alert" className="mt-6 text-[0.8125rem] text-danger">
                  That did not go through. You can email us directly at {COMPANY.email}.
                </p>
              ) : null}

              <div className="mt-12 flex flex-wrap items-center gap-3">
                {step > 0 ? (
                  <button type="button" onClick={goBack} className="btn btn-ghost">
                    <ArrowLeft />
                    Back
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
                  {isLast ? (status === 'sending' ? 'Sending…' : 'Start the conversation') : 'Continue'}
                  <ArrowRight />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * A question rendered as a real radio or checkbox group.
 *
 * The inputs stay in the DOM and are only visually hidden, so arrow-key
 * navigation within a radio group, the checked state and the accessible name all
 * come from the browser rather than being re-implemented badly in JavaScript.
 * The focus ring is carried by the visible sibling through `peer-focus-visible`,
 * since a visually hidden input cannot show one itself.
 */
function Choices({
  question,
  value,
  values,
  onPick,
  onToggle,
  headingRef,
}: {
  question: ChoiceQuestion;
  value?: string;
  values?: string[];
  onPick?: (option: string) => void;
  onToggle?: (option: string) => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  return (
    <fieldset>
      {/* `contents` keeps the legend semantics without its default box, so the
          heading below can carry the page's own type scale. */}
      <legend className="contents">
        <h2 ref={headingRef} tabIndex={-1} className="display-3 max-w-[20ch] outline-none">
          {question.legend}
        </h2>
      </legend>

      {question.multiple ? <p className="body-text mt-5">Choose as many as apply.</p> : null}

      <div className="mt-8 flex flex-wrap gap-3">
        {question.options.map((option) => {
          const checked = question.multiple ? Boolean(values?.includes(option)) : value === option;
          return (
            <label key={option} className="cursor-pointer">
              <input
                type={question.multiple ? 'checkbox' : 'radio'}
                name={question.id}
                value={option}
                checked={checked}
                onChange={() => (question.multiple ? onToggle?.(option) : onPick?.(option))}
                className="peer sr-only"
              />
              <span className="choice-chip peer-focus-visible:ring-2 peer-focus-visible:ring-accent peer-focus-visible:ring-offset-2">
                {option}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
