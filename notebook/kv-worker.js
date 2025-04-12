const headers = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET,POST",
	"Content-Type": "application/json",
};

const sha256base64 = async (text) => {
	const data = new TextEncoder().encode(text);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const byteArray = new Uint8Array(hashBuffer);
	return btoa(String.fromCharCode(...byteArray));
};

export default {
	async fetch(request, env) {
		const ip = request.headers.get("CF-Connecting-IP");

		try {
			if (request.method === "POST") {
				const text = await request.text();
				const hash = await sha256base64(text);
				const rateKey = `rate:${ip}`;

				const current = await env.notebook.get(rateKey);
				const count = current ? parseInt(current) : 0;

				if (count >= 5) {
					return new Response("Too Many Requests", { status: 429 });
				}

				await env.notebook.put(rateKey, (count + 1).toString(), {
					expirationTtl: 60,
				});

				await env.notebook.put(hash, text);

				return new Response(JSON.stringify({ hash }), {
					status: 200,
					headers,
				});
			}

			if (request.method === "GET") {
				const hash = new URL(request.url).searchParams.get("hash");
				if (!hash) {
					return new Response("Missing hash", {
						status: 400,
						headers,
					});
				}

				const value = await env.notebook.get(hash);
				if (!value) {
					return new Response("Not found", { status: 404, headers });
				}

				return new Response(value, {
					status: 200,
					headers: {
						...headers,
						"Content-Type": "text/plain",
					},
				});
			}

			return new Response("Method Not Allowed", { status: 405, headers });
		} catch (err) {
			return new Response(
				JSON.stringify({ error: err.stack || err.message }),
				{
					status: 500,
					headers,
				},
			);
		}
	},
};
