import axios from 'axios';

export class TokenUsagePlugin extends plugin {
  constructor() {
    super({
      name: 'Token用量统计',
      dsc: '统计最近24小时API token使用量',
      event: 'message',
      priority: 5000,
      rule: [
        {
          reg: '^#?token统计$',
          fnc: 'queryTokenUsage'
        }
      ]
    });

    // API配置
    this.apiConfig = {
      baseURL: 'https://new.xigua.wiki/api/data/',
      headers: {
        'Authorization': '',//替换为你的令牌
        'New-Api-User': ''//替换为你的id
      }
    };
  }

  async queryTokenUsage(e) {
    try {
      await e.reply('正在统计最近24小时token用量...');
      
      // 固定查询最近24小时数据
      const params = {
        username: '',
        start_timestamp: Math.floor(Date.now() / 1000) - 86400,
        end_timestamp: Math.floor(Date.now() / 1000),
        default_time: 'hour'
      };
      
      const response = await axios.get(this.apiConfig.baseURL, {
        params,
        headers: this.apiConfig.headers,
        timeout: 10000
      });
      
      await this.displayResults(e, response.data);
    } catch (error) {
      console.error('统计token用量出错:', error);
      await e.reply(`统计token用量出错: ${error.message}`);
    }
  }

  // 将数字转换为亿为单位
  formatToHundredMillion(num) {
    if (num < 100000000) {
      return (num / 10000).toFixed(2) + '万';
    }
    return (num / 100000000).toFixed(2) + '亿';
  }

  async displayResults(e, data) {
    if (!data?.success || !data.data) {
      await e.reply('未获取到有效token用量数据');
      return;
    }
    
    // 计算总token用量
    const totalTokens = data.data.reduce((sum, r) => sum + (r.token_used || 0), 0);
    
    // 格式化时间范围
    const endTime = new Date();
    const startTime = new Date(endTime - 86400000);
    
    await e.reply([
      `⏱️ 统计时间: ${startTime.toLocaleString()}`,
      `至 ${endTime.toLocaleString()}`,
      `🪙 总Token用量: ${this.formatToHundredMillion(totalTokens)} (${totalTokens.toLocaleString()})`,
      `📈 数据点数: ${data.data.length} (平均每小时约${Math.round(data.data.length/24)}个数据点)`
    ].join('\n'));
  }
}
