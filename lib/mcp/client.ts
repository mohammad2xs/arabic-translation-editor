// @ts-nocheck
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';

export interface MCPConfig {
  url: string;
  type: 'stdio' | 'websocket';
  name?: string;
}

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport | WebSocketClientTransport;
  private config: MCPConfig;

  constructor(config: MCPConfig) {
    this.config = config;
    
    if (config.type === 'websocket') {
      this.transport = new WebSocketClientTransport(new URL(config.url));
    } else {
      // For stdio, we'd need to spawn a process
      throw new Error('Stdio transport not implemented yet');
    }
    
    this.client = new Client(
      {
        name: config.name || 'arabic-translation-editor',
        version: '1.0.0',
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );
  }

  async connect(): Promise<void> {
    await this.client.connect(this.transport);
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async listTools(): Promise<any[]> {
    const result = await this.client.listTools();
    return result.tools || [];
  }

  async callTool(name: string, arguments_: any): Promise<any> {
    const result = await this.client.callTool({
      name,
      arguments: arguments_,
    });
    return result;
  }

  async listResources(): Promise<any[]> {
    const result = await this.client.listResources();
    return result.resources || [];
  }

  async readResource(uri: string): Promise<any> {
    const result = await this.client.readResource({ uri });
    return result;
  }
}

// Web-to-MCP specific client for your URL
export class WebToMCPClient extends MCPClient {
  constructor() {
    super({
      url: 'https://web-to-mcp.com/mcp/657946f0-c4c4-482d-892b-9d93597c67e7/',
      type: 'websocket',
      name: 'web-to-mcp-translation'
    });
  }
}

// Singleton instance
let mcpClient: WebToMCPClient | null = null;

export async function getMCPClient(): Promise<WebToMCPClient> {
  if (!mcpClient) {
    mcpClient = new WebToMCPClient();
    await mcpClient.connect();
  }
  return mcpClient;
}

export async function closeMCPClient(): Promise<void> {
  if (mcpClient) {
    await mcpClient.disconnect();
    mcpClient = null;
  }
}
