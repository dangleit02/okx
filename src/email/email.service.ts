import { Injectable } from "@nestjs/common";
import * as nodemailer from "nodemailer";
import { AppLogger } from "../logger/logger.service";

@Injectable()
export class EmailService {
  constructor(
    private readonly logger: AppLogger,
  ) { }

  async sendEmail(to: string, subject: string, data: any) {
    try {
      const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html: `
          <h3>Receipt JSON</h3>
          <pre>${JSON.stringify(data, null, 2)}</pre>
        `
      });
    } catch (error) {
      this.logger.log({ error: "Email failed to send" }, error);
    }
  }
}
