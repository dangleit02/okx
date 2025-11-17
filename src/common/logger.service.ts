import { Injectable, LoggerService } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as moment from 'moment';

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
    return moment().format('YYYY-MM-DD'); // e.g. 2025-11-05
  }

  private getTimestamp(): string {
    return moment().format('YYYY/MM/DD HH:mm:ss');
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
    let msgStr: string;

    if (typeof message === 'object') {
      try {
        msgStr = JSON.stringify(message, null, 2); // format đẹp
      } catch (err) {
        msgStr = String(message);
      }
    } else {
      msgStr = String(message);
    }

    const logLine = `[${this.getTimestamp()}] [${level}]${context ? ' [' + context + ']' : ''} - ${msgStr}${trace ? '\n' + trace : ''}\n`;
    fs.appendFileSync(this.logFile, logLine);
  }


  log(message: any, context?: string) {
    console.log(`[${this.getTimestamp()}] [LOG]${context ? ' [' + context + ']' : ''} -`, message);
    this.writeToFile('LOG', message, context);
  }

  error(message: any, trace?: string, context?: string) {
    console.error(`[${this.getTimestamp()}] [ERROR]${context ? ' [' + context + ']' : ''} -`, message);
    if (trace) console.error(trace);
    this.writeToFile('ERROR', message, context, trace);
  }

  warn(message: any, context?: string) {
    console.warn(`[${this.getTimestamp()}] [WARN]${context ? ' [' + context + ']' : ''} -`, message);
    this.writeToFile('WARN', message, context);
  }

  debug(message: any, context?: string) {
    console.debug(`[${this.getTimestamp()}] [DEBUG]${context ? ' [' + context + ']' : ''} -`, message);
    this.writeToFile('DEBUG', message, context);
  }

  verbose(message: any, context?: string) {
    console.info(`[${this.getTimestamp()}] [VERBOSE]${context ? ' [' + context + ']' : ''} -`, message);
    this.writeToFile('VERBOSE', message, context);
  }
}
