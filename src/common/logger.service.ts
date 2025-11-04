import { Injectable, LoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class AppLogger implements LoggerService {
  private logDir = path.join(process.cwd(), 'logs');
  private currentDate = this.getDateString();
  private logFile = path.join(this.logDir, `${this.currentDate}.log`);

  constructor() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private getDateString(): string {
    const now = new Date();
    return now.toISOString().split('T')[0]; // e.g. 2025-11-05
  }

  private ensureLogFile() {
    const today = this.getDateString();
    if (today !== this.currentDate) {
      // Date changed → update log file path
      this.currentDate = today;
      this.logFile = path.join(this.logDir, `${today}.log`);
    }
  }

  private writeToFile(level: string, message: any, context?: string, trace?: string) {
    this.ensureLogFile(); // check if date changed
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] [${level}]${context ? ' [' + context + ']' : ''} - ${message}${trace ? '\n' + trace : ''}\n`;
    fs.appendFileSync(this.logFile, logLine);
  }

  log(message: any, context?: string) {
    console.log(`[LOG]${context ? ' [' + context + ']' : ''} -`, message);
    this.writeToFile('LOG', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    console.error(`[ERROR]${context ? ' [' + context + ']' : ''} -`, message);
    if (trace) console.error(trace);
    this.writeToFile('ERROR', message, context, trace);
  }

  warn(message: any, context?: string) {
    console.warn(`[WARN]${context ? ' [' + context + ']' : ''} -`, message);
    this.writeToFile('WARN', message, context);
  }

  debug(message: any, context?: string) {
    console.debug(`[DEBUG]${context ? ' [' + context + ']' : ''} -`, message);
    this.writeToFile('DEBUG', message, context);
  }

  verbose(message: any, context?: string) {
    console.info(`[VERBOSE]${context ? ' [' + context + ']' : ''} -`, message);
    this.writeToFile('VERBOSE', message, context);
  }
}
