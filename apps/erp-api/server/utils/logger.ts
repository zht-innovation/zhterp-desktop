import fs from 'fs'
import path from 'path'
import { getRequestHeader, getRequestIP, type H3Event } from 'h3'

export enum LogLevel {
    ERROR = 'ERROR',
    WARN = 'WARN',
    INFO = 'INFO',
    DEBUG = 'DEBUG'
}

class Logger {
    private logDir: string
    private enableConsole: boolean
    private enableFile: boolean

    constructor(logDir = 'logs', enableConsole = true, enableFile = false) {
        this.logDir = logDir
        this.enableConsole = enableConsole
        this.enableFile = enableFile
        
        if (this.enableFile) {
            this.ensureLogDir()
        }
    }

    private ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true })
        }
    }

    private formatMessage(level: LogLevel, message: string, error?: Error): string {
        const timestamp = new Date().toISOString()
        let logMessage = `[${timestamp}] [${level}] ${message}`
        
        if (error) {
            logMessage += `\nError: ${error.message}`
            if (error.stack) {
                logMessage += `\nStack: ${error.stack}`
            }
        }
        
        return logMessage
    }

    private writeToFile(level: LogLevel, message: string) {
        if (!this.enableFile) return
        
        const today = new Date().toISOString().split('T')[0]
        const logFile = path.join(this.logDir, `${today}.log`)
        const errorLogFile = path.join(this.logDir, `error-${today}.log`)
        
        fs.appendFileSync(logFile, message + '\n')
        
        if (level === LogLevel.ERROR) {
            fs.appendFileSync(errorLogFile, message + '\n')
        }
    }

    private log(level: LogLevel, message: string, error?: Error) {
        const formattedMessage = this.formatMessage(level, message, error)
        
        if (this.enableConsole) {
            switch (level) {
                case LogLevel.ERROR:
                    console.log(formattedMessage)
                    break
                case LogLevel.WARN:
                    console.warn(formattedMessage)
                    break
                case LogLevel.INFO:
                    console.info(formattedMessage)
                    break
                case LogLevel.DEBUG:
                    console.debug(formattedMessage)
                    break
            }
        }
        
		if (this.enableFile)
        	this.writeToFile(level, formattedMessage)
    }

    error(message: string, error?: Error) {
        this.log(LogLevel.ERROR, message, error)
    }

    warn(message: string, error?: Error) {
        this.log(LogLevel.WARN, message, error)
    }

    info(message: string, error?: Error) {
        this.log(LogLevel.INFO, message, error)
    }

    debug(message: string, error?: Error) {
        this.log(LogLevel.DEBUG, message, error)
    }

    logRequestError(event: H3Event, error: Error, context?: string) {
        const method = event.method || event.node.req.method
        const url = event.path || event.node.req.url
        
        const ip = getRequestIP(event, { xForwardedFor: true })
        const userAgent = getRequestHeader(event, 'user-agent')

        const errorInfo = {
            method: method,
            url: url,
            ip: ip,
            userAgent: userAgent,
            context: context || 'Request Error'
        }
        
        this.error(`${errorInfo.context} - ${errorInfo.method} ${errorInfo.url} from ${errorInfo.ip}`, error)
    }
}

export const logger = new Logger()
