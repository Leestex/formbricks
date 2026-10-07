// qlane postdeploy seed (compose.qlane.yml, label ai.qlane.postdeploy on the formbricks service).
//
// Creates the QA login through Better Auth's credential sign-up route. Formbricks admits an uninvited
// sign-up only while the instance has no users: that is how the initial administrator is created
// (apps/web/modules/auth/lib/signup-policy.ts). The account has no organization yet; on first login
// Formbricks asks for one. Then proves the login with a sign-in.
//
// Idempotent: on a second run the sign-up is refused (the instance is no longer fresh) and the
// sign-in alone decides. Prints no secret.

const BASE = "http://127.0.0.1:3000";
const origin = process.env.BETTER_AUTH_URL;
const email = process.env.QA_EMAIL;
const password = process.env.QA_PASSWORD;

if (!origin || !email || !password) {
  console.error("qlane-seed: BETTER_AUTH_URL, QA_EMAIL and QA_PASSWORD must be set");
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForHealth(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      // not listening yet
    }
    await sleep(2000);
  }
  throw new Error(`qlane-seed: ${BASE}/health did not answer 200 within ${timeoutMs / 1000}s`);
}

// Better Auth checks the Origin of a state-changing request against its trusted origins, which
// Formbricks derives from BETTER_AUTH_URL.
async function post(path, body) {
  const res = await fetch(`${BASE}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text: text.slice(0, 300) };
}

await waitForHealth(300_000);

const signUp = await post("/sign-up/email", { name: "QA Tester", email, password });
// 403 is the expected answer on a second run; any other refusal is shown before the sign-in decides.
console.log(
  `qlane-seed: sign-up answered ${signUp.status}${signUp.status >= 300 ? `: ${signUp.text}` : ""}`
);
if (signUp.status >= 500) {
  console.error(`qlane-seed: sign-up failed: ${signUp.text}`);
  process.exit(1);
}

const signIn = await post("/sign-in/email", { email, password });
if (signIn.status !== 200) {
  console.error(`qlane-seed: sign-in as ${email} answered ${signIn.status}: ${signIn.text}`);
  process.exit(1);
}
console.log(`qlane-seed: ${email} can sign in`);
