import { Link } from 'react-router-dom';
import LegalPage, { P, UL, H3, DefRow } from '../../components/landing/LegalPage';
import { SITE, formatAddress } from '../../lib/siteConfig';

/**
 * Privacy Policy.
 *
 * The sub-processor list is not boilerplate — it is drawn from the backend's actual
 * dependencies (backend-firestore/package.json) and the services those calls reach:
 * Firebase/Google Cloud, Google Gemini, Google Cloud Text-to-Speech, Pinecone, Groq,
 * OpenAI, Razorpay and Redis. If a provider is added or dropped, this list must change
 * with it — an inaccurate processor list is the part of a privacy policy most likely to
 * cause an actual problem.
 */
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What Scholarly collects, why we collect it, who processes it on our behalf, and the control you have over it."
      sections={[
        {
          id: 'scope',
          title: '1. Scope',
          body: (
            <>
              <P>
                This policy explains how {SITE.legalEntity} (&ldquo;we&rdquo;) handles personal data
                when you use Scholarly. We are the data fiduciary for that data.
              </P>
              <P>
                It is written to meet our obligations under India&rsquo;s Digital Personal Data
                Protection Act, 2023 and the Information Technology Act, 2000 and rules made under
                it. Where you are covered by another regime, such as the GDPR, we apply the
                stronger protection.
              </P>
            </>
          ),
        },
        {
          id: 'collect',
          title: '2. What we collect',
          body: (
            <>
              <dl className="mt-1">
                <DefRow term="Account">
                  Your email address and display name, and your profile photo if you sign in with
                  Google. Authentication is handled by Firebase Authentication; we never see or
                  store your Google password.
                </DefRow>
                <DefRow term="Learning profile">
                  What you tell the setup wizard: your target exam and year, board, stream,
                  subjects, preparation level, goal, study time, preferred way of learning and
                  language. This is what personalises every answer.
                </DefRow>
                <DefRow term="Teaching profile">
                  For teacher accounts: the subjects, classes, boards and exams you teach, and your
                  teaching preferences.
                </DefRow>
                <DefRow term="Content you upload">
                  PDFs, notes, documents and photographs of questions. We extract their text, split
                  it into passages and generate numerical embeddings so the material can be searched
                  and cited.
                </DefRow>
                <DefRow term="Activity">
                  Your conversations with the tutor, saved doubts, quiz and mock-test attempts,
                  assessment results, planner entries, and progress analytics derived from them.
                </DefRow>
                <DefRow term="Community">
                  Posts, replies and study-group membership, plus direct messages you send through
                  the product.
                </DefRow>
                <DefRow term="Payments">
                  Plan, billing period, amount, payment status and the reference identifiers
                  returned by Razorpay. We do <strong className="font-semibold">not</strong> receive
                  or store your card number, CVV, UPI PIN or netbanking credentials.
                </DefRow>
                <DefRow term="Technical">
                  IP address, device and browser type, and request logs — kept for security, abuse
                  prevention and rate limiting.
                </DefRow>
              </dl>
            </>
          ),
        },
        {
          id: 'use',
          title: '3. Why we use it',
          body: (
            <UL
              items={[
                'To run the features you ask for — answering a question, indexing a notebook, generating a podcast, marking a test.',
                'To personalise explanations to your exam, subjects and level, which is the core of what the product does.',
                'To show you your own progress and weak areas.',
                'To take payment and give you access to the plan you bought.',
                'To keep the service secure and available — rate limiting, abuse detection, fraud prevention.',
                'To support you when you contact us.',
                'To meet legal, tax and accounting obligations.',
              ]}
            />
          ),
        },
        {
          id: 'ai',
          title: '4. AI processing',
          body: (
            <>
              <P>
                To produce an answer, the content of your question — along with relevant passages
                retrieved from curriculum material and from documents you uploaded, and a summary of
                your learning profile — is sent to the AI providers listed below, processed, and
                returned to you.
              </P>
              <P>
                We do not sell your content, and we do not use it to train foundation models for
                third parties. Where a provider offers a no-training option for API traffic, we use
                it.
              </P>
              <P>
                Automated processing here produces study material. It does not make decisions that
                have a legal or similarly significant effect on you.
              </P>
            </>
          ),
        },
        {
          id: 'processors',
          title: '5. Who processes data on our behalf',
          body: (
            <>
              <P>
                We do not sell personal data. We share it only with the providers we need to run the
                service, each bound by contract to use it only on our instructions:
              </P>
              <dl className="mt-1">
                <DefRow term="Google Firebase">
                  Authentication, Firestore database and Cloud Storage — the primary store for your
                  account, profile, activity and uploaded files.
                </DefRow>
                <DefRow term="Google Gemini">
                  Generating explanations, summaries, quizzes and reasoning traces.
                </DefRow>
                <DefRow term="Google Cloud Text-to-Speech">
                  Synthesising the voices used in generated podcasts.
                </DefRow>
                <DefRow term="Pinecone">
                  Storing the numerical embeddings of your documents so passages can be retrieved by
                  meaning rather than keyword.
                </DefRow>
                <DefRow term="OpenAI · Groq">
                  Additional model inference and embedding generation for parts of the pipeline.
                </DefRow>
                <DefRow term="Razorpay">
                  Collecting and processing payments. Razorpay is the controller of the card data
                  you enter in its window; its own privacy policy governs that.
                </DefRow>
                <DefRow term="Redis">Caching and rate-limit counters.</DefRow>
              </dl>
              <P>
                We may also disclose data where the law requires it, to enforce our terms, or to
                protect the rights and safety of our users.
              </P>
            </>
          ),
        },
        {
          id: 'transfer',
          title: '6. Where your data is processed',
          body: (
            <P>
              Several of the providers above operate outside India, so your data may be processed in
              other countries, including the United States and the European Union. When data is
              transferred out of India we rely on contractual safeguards with each provider, and we
              transfer only what the feature requires. We do not transfer personal data to any
              territory that the Central Government has restricted.
            </P>
          ),
        },
        {
          id: 'retention',
          title: '7. How long we keep it',
          body: (
            <>
              <UL
                items={[
                  'Account and learning profile — for as long as your account exists.',
                  'Uploaded documents and notebooks — until you delete them. Deleted items go to Trash and are recoverable for 30 days, after which they and their embeddings are permanently removed.',
                  'Conversations and activity history — for as long as your account exists, unless you delete individual items.',
                  'Payment and invoice records — retained for the period Indian tax and accounting law requires, typically eight financial years, even after you close your account.',
                  'Security and request logs — up to 12 months.',
                ]}
              />
              <P>
                When you delete your account we remove your personal data and your content within 30
                days, apart from records we are legally required to keep and anonymised aggregates
                that can no longer identify you.
              </P>
            </>
          ),
        },
        {
          id: 'rights',
          title: '8. Your rights',
          body: (
            <>
              <P>You may:</P>
              <UL
                items={[
                  'Access the personal data we hold about you, and get a summary of how it is processed.',
                  'Correct or complete anything inaccurate — most of it is editable directly in Settings.',
                  'Delete your account and your content.',
                  'Withdraw a consent you previously gave, which will stop the processing that relied on it.',
                  'Nominate another person to exercise these rights if you are unable to.',
                  'Complain to the Data Protection Board of India if you are not satisfied with our response.',
                ]}
              />
              <P>
                Most of this is self-service in Settings. For anything else, write to{' '}
                <a href={`mailto:${SITE.email.privacy}`} className="underline underline-offset-2">
                  {SITE.email.privacy}
                </a>
                . We respond within 30 days.
              </P>
            </>
          ),
        },
        {
          id: 'children',
          title: '9. Children’s data',
          body: (
            <>
              <P>
                Scholarly is built for exam preparation, so we expect learners under 18 to use it.
                An account for a person under 18 must be created and supervised by a parent or legal
                guardian, who provides consent for the processing described here.
              </P>
              <P>
                For users we know to be children we do not serve behavioural advertising, we do not
                track them for advertising purposes, and we do not use their data for any purpose
                likely to have a detrimental effect on their wellbeing.
              </P>
              <P>
                If you believe a child has created an account without a guardian&rsquo;s consent,
                write to{' '}
                <a href={`mailto:${SITE.email.privacy}`} className="underline underline-offset-2">
                  {SITE.email.privacy}
                </a>{' '}
                and we will remove it.
              </P>
            </>
          ),
        },
        {
          id: 'cookies',
          title: '10. Cookies and local storage',
          body: (
            <>
              <H3>What we use</H3>
              <UL
                items={[
                  'Strictly necessary — keeping you signed in and protecting the session. The service cannot work without these.',
                  'Preference — remembering your light or dark theme choice and similar settings, stored in your browser’s local storage.',
                ]}
              />
              <P>
                We do not use advertising cookies and we do not sell data to advertising networks.
                You can clear this data in your browser at any time; clearing the necessary ones
                will sign you out.
              </P>
            </>
          ),
        },
        {
          id: 'security',
          title: '11. How we protect it',
          body: (
            <P>
              Data is encrypted in transit and at rest, access is restricted to the people who need
              it, and payment credentials never reach our servers. Our{' '}
              <Link to="/security" className="underline underline-offset-2">security page</Link>{' '}
              describes the controls in more detail, including how to report a vulnerability. No
              system is perfectly secure; if a breach affects your personal data we will notify you
              and the Data Protection Board as the law requires.
            </P>
          ),
        },
        {
          id: 'grievance',
          title: '12. Grievance Officer',
          body: (
            <>
              <P>
                In accordance with the Digital Personal Data Protection Act, 2023 and the
                Information Technology Act, 2000, you may contact our Grievance Officer about any
                complaint regarding your personal data:
              </P>
              <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02] p-5 space-y-1">
                <p className="text-[14px] font-semibold text-slate-900 dark:text-white">Grievance Officer</p>
                <p className="text-[13.5px] text-slate-600 dark:text-gray-300">{SITE.legalEntity}</p>
                <p className="text-[13.5px] text-slate-600 dark:text-gray-300">{formatAddress()}</p>
                <p className="text-[13.5px] text-slate-600 dark:text-gray-300">
                  <a href={`mailto:${SITE.email.privacy}`} className="underline underline-offset-2">
                    {SITE.email.privacy}
                  </a>
                </p>
              </div>
              <P>
                We acknowledge complaints within 48 hours and aim to resolve them within 30 days.
              </P>
            </>
          ),
        },
        {
          id: 'changes',
          title: '13. Changes to this policy',
          body: (
            <P>
              We will update this page when our practices change, and revise the &ldquo;last
              updated&rdquo; date above. If a change materially affects how we use your data we will
              tell you in the app or by email before it takes effect.
            </P>
          ),
        },
      ]}
    />
  );
}
