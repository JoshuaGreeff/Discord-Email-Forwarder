import { Client } from "@microsoft/microsoft-graph-client";

export interface GraphTokenSet {
  accessToken: string;
  expiresAt: number;
  refreshToken?: string;
}

export async function getAppOnlyToken(params: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<GraphTokenSet> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const res = await fetch(`https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`App-only token request failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  const expiresAt = Math.floor(Date.now() / 1000) + json.expires_in - 60; // add small buffer

  return {
    accessToken: json.access_token,
    expiresAt,
  };
}

export function getGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}
