import { Controller, Get } from '@nestjs/common';
import { createHash } from 'node:crypto';

@Controller()
export class AppController {
  @Get("health")
  health(): Record<string, string | boolean> {
    return {
      ok: true,
      service: "api",
      app: process.env.APP_NAME || "privatechat",
      ts: new Date().toISOString(),
    };
  }

  @Get("bootstrap")
  bootstrap(): Record<string, string> {
    const domain = process.env.DOMAIN || "localhost";
    const adminEmail = process.env.ADMIN_EMAIL || "admin@example.com";
    const token = createHash("sha256")
      .update(`${domain}:${adminEmail}`)
      .digest("hex")
      .slice(0, 20);

    return {
      app: process.env.APP_NAME || "privatechat",
      adminEmail,
      url: `https://${domain}`,
      inviteUrl: `https://${domain}/invite/${token}`,
      note: "MVP payload. Replace with DB-backed bootstrap later.",
    };
  }
}
