import fetch from "isomorphic-fetch";
import { Client } from "@microsoft/microsoft-graph-client";

export interface GraphTokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export function getAuthUrl(opts: { tenantId: string; clientId: string; redirectUri: string; state: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: "code",
    redirect_uri: opts.redirectUri,
    response_mode: "query",
    scope: "offline_access Mail.Read Mail.Read.Shared User.Read",
    state: opts.state,
  });
  return `https://login.microsoftonline.com/${opts.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(params: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<GraphTokenSet> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "authorization_code",
    redirect_uri: params.redirectUri,
    code: params.code,
  });

  const res = await fetch(`https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expiresAt = Math.floor(Date.now() / 1000) + json.expires_in;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
  };
}

export async function refreshAccessToken(params: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken: string;
}): Promise<GraphTokenSet> {
  const body = new URLSearchParams({
    client_id: params.clientId,
    client_secret: params.clientSecret,
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    redirect_uri: params.redirectUri,
  });

  const res = await fetch(`https://login.microsoftonline.com/${params.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const json = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  const expiresAt = Math.floor(Date.now() / 1000) + json.expires_in;

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
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
