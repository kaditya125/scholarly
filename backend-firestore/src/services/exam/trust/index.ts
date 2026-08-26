/**
 * Missing intermediate CA certificates for official hosts that serve a broken chain.
 *
 * bpsc.bihar.gov.in presents a leaf issued by "GoGetSSL RSA DV SSL CA 2" but sends
 * "GoGetSSL RSA DV CA" as its intermediate — a different CA entirely. The path therefore cannot be
 * built and Node rejects the connection with "unable to verify the first certificate". Browsers
 * hide this by chasing the certificate's AIA extension; Node does not.
 *
 * The certificate here was fetched from the AIA URI named by the site's own leaf certificate
 * (http://crt.sectigo.com/GoGetSSLRSADVSSLCA2.crt). It is a public CA intermediate, not a secret.
 *
 * WHY THIS RATHER THAN rejectUnauthorized: false
 *
 * Disabling verification would make every official-source fetch unauthenticated, which is the one
 * guarantee this pipeline is built on — a syllabus is only trustworthy because it provably came
 * from the commission that set it. Supplying the intermediate keeps verification fully on: the
 * chain is checked, the hostname is checked, and an actual bad certificate still fails. All that
 * changes is that Node can now assemble a path the server should have sent itself.
 *
 * These are ADDED to the system roots, never substituted for them.
 */
import fs from 'fs';
import path from 'path';
import tls from 'tls';

const SUPPLEMENTAL_FILES = ['gogetssl-rsa-dv-ssl-ca-2.pem'];

let cached: string[] | null = null;

/** System roots plus the intermediates above. Read once. */
export function certificateAuthorities(): string[] {
  if (cached) return cached;
  const extras: string[] = [];
  for (const file of SUPPLEMENTAL_FILES) {
    try {
      extras.push(fs.readFileSync(path.join(__dirname, file), 'utf8'));
    } catch (err) {
      // A missing supplement must not take out fetching for every other exam; the affected host
      // simply fails its own TLS check, loudly, the way it did before this existed.
      console.warn(`[officialFetch] supplemental CA ${file} could not be read:`, (err as any)?.message);
    }
  }
  cached = [...tls.rootCertificates, ...extras];
  return cached;
}
