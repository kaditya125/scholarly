/**
 * Phase 0 — structural guard on route authentication.
 *
 * Deliberately a source-level assertion rather than a request-level one. The gaps this
 * closes were not logic bugs: /documents shipped with `// router.use(requireAuth)`
 * commented out and a note saying "temporarily removing requireAuth so the frontend can
 * function without a login". A behavioural test cannot catch a guard being commented out
 * in a file it does not import, whereas this fails loudly and names the file.
 *
 * Cheap (reads files, boots nothing) and precise about the regression it prevents.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROUTES_DIR = path.join(__dirname, '../../src/routes');
const read = (f: string) => fs.readFileSync(path.join(ROUTES_DIR, f), 'utf8');

/** Strips comments so a commented-out guard never counts as protection. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

describe('Phase 0 — routes hardened in this phase enforce authentication', () => {
  const HARDENED = [
    'baselineAssessment.routes.ts',
    'planning.routes.ts',
    'documents.routes.ts',
    'analytics.routes.ts',
  ];

  it.each(HARDENED)('%s applies requireAuth in live code (not commented out)', (file) => {
    const live = stripComments(read(file));
    expect(live).toMatch(/router\.use\(\s*requireAuth\s*\)/);
    expect(live).toMatch(/import\s*\{[^}]*requireAuth[^}]*\}\s*from\s*['"]\.\.\/middlewares\/auth['"]/);
  });

  it('baseline-assessment enforces self on every :userId route', () => {
    const live = stripComments(read('baselineAssessment.routes.ts'));
    const userIdRoutes = live.match(/router\.(get|post|put|delete)\([^)]*:userId[^)]*\)/g) || [];
    expect(userIdRoutes.length).toBeGreaterThanOrEqual(4);
    for (const r of userIdRoutes) {
      expect(r).toMatch(/enforceSelf\(/);
    }
  });

  it('planning enforces self on its :userId route', () => {
    const live = stripComments(read('planning.routes.ts'));
    expect(live).toMatch(/router\.get\(\s*['"]\/user\/:userId['"]\s*,\s*enforceSelf\(/);
  });
});

describe('Phase 0 — controllers derive identity from the token, not the payload', () => {
  const CONTROLLERS = path.join(__dirname, '../../src/controllers');

  it('planning.controller never treats a request-supplied userId as identity', () => {
    const live = stripComments(fs.readFileSync(path.join(CONTROLLERS, 'planning.controller.ts'), 'utf8'));

    // Identity must come from the verified token.
    expect(live).toMatch(/const\s+userId\s*=\s*req\.user!?\.uid/);

    // And must NOT be pulled out of the body/query, which is what made the previous
    // `sessionData.userId !== userId` comparison meaningless (both sides client-supplied).
    expect(live).not.toMatch(/const\s*\{[^}]*\buserId\b[^}]*\}\s*=\s*req\.(body|query)/);
  });

  it('analytics.controller scopes costs by verified role, not by query string', () => {
    const live = stripComments(fs.readFileSync(path.join(CONTROLLERS, 'analytics.controller.ts'), 'utf8'));
    expect(live).toMatch(/isAdmin\(req\)/);
    expect(live).toMatch(/req\.user!?\.uid/);
    // The bare "trust the query string" form must be gone.
    expect(live).not.toMatch(/const\s+userId\s*=\s*req\.query\.userId\s+as\s+string;/);
  });
});
