import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from '@/components/Icons';
import Field from '@/components/Field';
import PageHeader from '@/components/PageHeader';
import { revealProps } from '@/lib/reveal';
import { useSeo } from '@/lib/useSeo';
import { submitEnquiry } from '@/lib/submitEnquiry';
import { COMPANY } from '@/site.config';

type FieldName = 'name' | 'email' | 'company' | 'message' | 'budget';
type Errors = Partial<Record<FieldName, string>>;
type Status = 'idle' | 'sending' | 'sent' | 'handoff' | 'error';

const FIELD_LABELS: Record<FieldName, string> = {
  name: 'Name',
  email: 'Work email',
  company: 'Company',
  message: 'What can we help with?',
  budget: 'Budget or timeline',
};

/** Deliberately permissive: the point is to catch a typo, not to police an address. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Contact() {
  useSeo({
    title: `Contact — ${COMPANY.name}`,
    description:
      `Tell us what you are working on. ${COMPANY.name} works on technology consulting, digital product engineering and software solutions.`,
    path: '/contact',
  });

  const [values, setValues] = useState<Record<FieldName, string>>({
    name: '',
    email: '',
    company: '',
    message: '',
    budget: '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>('idle');
  const formRef = useRef<HTMLFormElement>(null);

  // Widened to `string` because the shared Field component is not tied to this
  // page's union — the names it can emit are exactly the ones rendered below.
  const setField = (field: string, value: string) => {
    const key = field as FieldName;
    setValues((current) => ({ ...current, [key]: value }));
    // Clear an error as soon as the visitor starts fixing it, rather than making
    // them submit again to find out whether they have.
    setErrors((current) => (current[key] ? { ...current, [key]: undefined } : current));
  };

  const validate = (): Errors => {
    const next: Errors = {};
    if (!values.name.trim()) next.name = 'Please tell us your name.';
    if (!values.email.trim()) next.email = 'Please add an email address we can reply to.';
    else if (!EMAIL_PATTERN.test(values.email.trim()))
      next.email = 'That does not look like a complete email address.';
    if (values.message.trim().length < 12)
      next.message = 'A sentence or two about the problem is enough to start.';
    return next;
  };

  const composeBody = () =>
    [
      `Name: ${values.name.trim()}`,
      `Email: ${values.email.trim()}`,
      values.company.trim() ? `Company: ${values.company.trim()}` : null,
      values.budget.trim() ? `Budget / timeline: ${values.budget.trim()}` : null,
      '',
      values.message.trim(),
    ]
      .filter((line) => line !== null)
      .join('\n');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      // Send focus to the first problem so a keyboard or screen-reader user is
      // taken to it rather than having to hunt back up the form.
      const firstInvalid = Object.keys(nextErrors)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    /* Two routes, in order of preference:
       1. A configured endpoint, if the deployment has one.
       2. The visitor's own mail client, pre-filled. This works with no backend at
          all and sends nothing anywhere the visitor cannot see. */
    setStatus('sending');
    const subject = `New enquiry — ${values.name.trim()}${
      values.company.trim() ? ` (${values.company.trim()})` : ''
    }`;
    setStatus(await submitEnquiry({ subject, body: composeBody(), payload: values }));
  };

  if (status === 'sent') {
    return (
      <>
        <PageHeader
          label="Contact"
          title="Thank you — your message is with us."
          lede="We read everything that comes in and reply to the ones we can genuinely help with."
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

  return (
    <>
      <PageHeader
        label="Contact"
        title="Have something worth building?"
        lede="Tell us what you're working on. We'll start with the problem, not the pitch."
      />

      <div className="container-tl py-14 md:py-20">
        <div className="grid gap-14 md:grid-cols-12 md:gap-10">
          {/* Details */}
          <aside className="md:col-span-4" {...revealProps()}>
            <dl className="space-y-8">
              {COMPANY.email ? (
                <div>
                  <dt className="label">Email</dt>
                  <dd className="mt-3">
                    <a
                      href={`mailto:${COMPANY.email}`}
                      className="text-[1.0313rem] text-ink underline decoration-line-2 underline-offset-4 transition-colors duration-300 hover:decoration-ink"
                    >
                      {COMPANY.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="label">Based in</dt>
                <dd className="mt-3 text-[1.0313rem] text-ink">{COMPANY.location}</dd>
              </div>
              <div>
                <dt className="label">What happens next</dt>
                <dd className="body-text mt-3 max-w-[34ch]">
                  A person reads it. If it is something we can help with, you will hear back with
                  questions about the problem rather than a proposal.
                </dd>
              </div>
              <div>
                <dt className="label">Company</dt>
                <dd className="mt-3">
                  <Link to="/company" className="link-arrow text-[0.9375rem]">
                    Company information
                    <ArrowRight size={14} />
                  </Link>
                </dd>
              </div>
            </dl>
          </aside>

          {/* Form */}
          <div className="md:col-span-7 md:col-start-6" {...revealProps(80)}>
            <form ref={formRef} noValidate onSubmit={handleSubmit} className="space-y-9">
              <Field
                name="name"
                label={FIELD_LABELS.name}
                value={values.name}
                error={errors.name}
                required
                autoComplete="name"
                onChange={setField}
              />
              <Field
                name="email"
                label={FIELD_LABELS.email}
                type="email"
                value={values.email}
                error={errors.email}
                required
                autoComplete="email"
                onChange={setField}
              />
              <Field
                name="company"
                label={FIELD_LABELS.company}
                value={values.company}
                error={errors.company}
                autoComplete="organization"
                hint="Optional"
                onChange={setField}
              />
              <Field
                name="message"
                label={FIELD_LABELS.message}
                value={values.message}
                error={errors.message}
                required
                multiline
                hint="The problem, roughly. Detail is welcome but not required."
                onChange={setField}
              />
              <Field
                name="budget"
                label={FIELD_LABELS.budget}
                value={values.budget}
                error={errors.budget}
                hint="Optional — a range or a rough timeline both help."
                onChange={setField}
              />

              <div className="flex flex-wrap items-center gap-6 border-t border-line pt-8">
                <button type="submit" className="btn btn-primary" disabled={status === 'sending'}>
                  {status === 'sending' ? 'Sending…' : 'Start a conversation'}
                  <ArrowRight />
                </button>

                {/* One live region for every outcome, so assistive technology
                    announces the result without the focus moving. */}
                <p role="status" aria-live="polite" className="text-[0.875rem] text-ink-2">
                  {status === 'handoff'
                    ? 'Your email client should have opened with the message ready to send.'
                    : status === 'error'
                      ? COMPANY.email
                        ? `That didn’t go through. Please email ${COMPANY.email} directly.`
                        : 'That didn’t go through. Please try again shortly.'
                      : ''}
                </p>
              </div>

              <p className="text-[0.8125rem] text-ink-3">
                We use what you send here only to reply to you. See the{' '}
                <Link to="/privacy" className="underline underline-offset-4 hover:text-ink">
                  privacy notice
                </Link>
                .
              </p>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * One field, with its label, hint and error wired together. Every input on the
 * site goes through this so the accessible names, the `aria-describedby` chain
 * and the invalid state cannot drift apart between fields.
 */
