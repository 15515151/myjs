import axios from "axios";

export class ModelChecker extends plugin {
  constructor() {
    super({
      name: "模型状态检测",
      dsc: "检测多个站点及其多个模型的运行状态",
      event: "message",
      priority: 5000,
      rule: [
        { reg: "^#?公益模型状态$", fnc: "checkModels" }
      ]
    });

    // 站点与模型配置
    this.sites = [
      {
        name: "newone.qqun.top",
        baseURL: "https://newone.qqun.top/v1/chat/completions",
        apiKey: "sk-x0EzKIZiajsZTksHhwwHGRkD99o4uOgfq6JeI4ylrnzcV2KH",//本站为公益站，也是我自己搭建的，apikey留给有缘人
        models: [
          { name: "3885-gemini-2.5-flash-nothinking", display: "3885-gemini-2.5-flash-nothinking" },
          { name: "3885-硅基-DeepSeek-V3", display: "3885-硅基-DeepSeek-V3" }
        ]
      },
      {
        name: "通义千问",
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
        apiKey: "换你自己的",
        models: [
          { name: "qwen3-0.6b", display: "qwen3-0.6b" }
        ]
      }
    ];

    this.testPrompt = "请回复'运行正常'";
    this.timeout = 10000;
    this.maxResponseLength = 80;

    // 需要检测的线路
    this.endpoints = [
      { name: "🌍 eo全球分流", url: "https://new.xigua.wiki" }
    ];
  }

  /* ========================== 主入口 ========================== */
  async checkModels(e) {
    const msgQueue = [];
    const botInfo = {
      nickname: e.bot.nickname,
      user_id: e.bot.uin
    };

    // 标题
    msgQueue.push({
      ...botInfo,
      message: `📡 模型状态检测 - ${new Date().toLocaleString()}`
    });

    /* -------- 并发：模型检测 + 线路检测 -------- */
    const modelTasks = [];
    for (const site of this.sites) {
      for (const model of site.models) {
        modelTasks.push(this.checkSingleModel(site, model));
      }
    }

    const lineTasks = this.endpoints.map(ep => this.probeEndpoint(ep));

    const [modelResults, lineResults] = await Promise.all([
      Promise.all(modelTasks),
      Promise.all(lineTasks)
    ]);

    /* -------- 模型检测结果 -------- */
    const grouped = {};
    modelResults.forEach(r => {
      (grouped[r.siteName] ||= []).push(r);
    });

    for (const [siteName, arr] of Object.entries(grouped)) {
      msgQueue.push({ ...botInfo, message: `🏠 站点: ${siteName}` });
      arr.forEach(r => {
        msgQueue.push({ ...botInfo, message: this.formatModelStatus(r) });
      });
    }

    /* -------- 线路检测结果 -------- */
    msgQueue.push({ ...botInfo, message: "🛰️ 线路连通性:" });
    lineResults.forEach(r => {
      const icon = r.ok ? "✅" : "❌";
      msgQueue.push({
        ...botInfo,
        message: `${icon} ${r.name}  —  ${r.status} [${r.cost}ms]`
      });
    });

    /* -------- 总结 & 公益站信息 -------- */
    msgQueue.push({
      ...botInfo,
      message: this.generateSummary(modelResults)
    });

    msgQueue.push({
      ...botInfo,
      message: `公益模型站：
优先使用：
🌍 eo全球分流: https://new.xigua.wiki/v1
🇸🇬 亚太线路: https://newone.qqun.top/v1
也能用：
🇭🇰 eo香港线路: https://new.qqun.top/v1
🇺🇸 美国线路: https://cnmcdn.qqun.top/v1

gemini模型支持gemini格式调用，将/v1改成/v1beta

🔑 API Key(全部模型免费):
sk-x0EzKIZiajsZTksHhwwHGRkD99o4uOgfq6JeI4ylrnzcV2KH

📜 模型列表(内涵250+模型): 
https://new.qqun.top/pricing
🚀 推荐使用3885开头的模型

有更多问题？
加群提问
点击链接加入群聊【xuxue07.cn】：https://qm.qq.com/q/3aVYNkBbBK`
    });

    await e.reply(await Bot.makeForwardMsg(msgQueue));
    return true;
  }

  /* ========================== 工具方法 ========================== */

  /* 单模型检测 */
  async checkSingleModel(site, model) {
    const startTime = Date.now();
    let status = "❌ 检测失败";
    let response = "无响应";
    let latency = 0;
    let errorType = "";

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const body = {
        model: model.name,
        messages: [{ role: "user", content: this.testPrompt }],
        max_tokens: 50
      };

      if (site.baseURL.includes("dashscope.aliyuncs.com")) {
        body.enable_thinking = false;
        body.stream = false;
      }

      const res = await axios.post(site.baseURL, body, {
        headers: {
          Authorization: `Bearer ${site.apiKey}`,
          "Content-Type": "application/json"
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      latency = Date.now() - startTime;

      const content = res.data?.choices?.[0]?.message?.content?.trim();
      status = content?.includes("运行正常") ? "✅ 运行正常" : "⚠️ 响应异常";
      response = content || "无有效内容";
    } catch (err) {
      latency = Date.now() - startTime;
      if (err.name === "AbortError") {
        status = "⌛ 请求超时";
        errorType = "超时";
      } else if (err.response) {
        status = "❌ API错误";
        errorType = `HTTP ${err.response.status}`;
        response = err.response.data?.error?.message || "未知错误";
      } else if (err.request) {
        status = "❌ 无响应";
        errorType = "网络错误";
        response = err.message;
      } else {
        status = "❌ 请求失败";
        errorType = "配置错误";
        response = err.message;
      }
    }

    return {
      siteName: site.name,
      modelName: model.display,
      status,
      response: this.truncateResponse(response),
      latency,
      errorType
    };
  }

  /* 线路连通性探测 */
async probeEndpoint({ name, url }) {
  const start = Date.now();
  let status = "探测失败";
  let ok = false;
  
  try {
    // 对所有线路使用GET请求
    const res = await axios.get(url, { 
      timeout: 8000,
      validateStatus: function (status) {
        // 确保只有200状态码不会抛出错误
        return status === 200;
      }
    });
    
    // 只有200状态码会到达这里
    ok = true;
    status = res.status;
  } catch (err) {
    if (err.response) {
      // 显示实际的状态码
      status = err.response.status;
      ok = false; // 任何非200状态码都视为异常
    }
    else if (err.code === "ENOTFOUND") status = "DNS解析失败";
    else if (err.code === "ECONNABORTED") status = "超时";
    else status = "网络错误";
  }
  
  return { name, status, ok, cost: Date.now() - start };
}

  /* 截断响应字符串 */
  truncateResponse(str) {
    if (typeof str !== "string") return "无文本响应";
    return str.length <= this.maxResponseLength
      ? str
      : str.substring(0, this.maxResponseLength) + "...";
  }

  /* 格式化单条模型状态 */
  formatModelStatus(r) {
    return `🛠️ 模型: ${r.modelName}
📊 状态: ${r.status}
⏱️ 延迟: ${r.latency}ms
💬 响应: ${r.response}
${r.errorType ? `⚠️ 错误: ${r.errorType}` : ""}`;
  }

  /* 生成模型检测总结 */
  generateSummary(results) {
    const total = results.length;
    const ok = results.filter(r => r.status.includes("✅")).length;
    const warn = results.filter(r => r.status.includes("⚠️")).length;
    const err = total - ok - warn;
    const okReq = results.filter(r => !r.errorType);
    const avg = okReq.length
      ? Math.round(okReq.reduce((s, r) => s + r.latency, 0) / okReq.length)
      : 0;

    return `📊 检测总结:
✅ 正常模型: ${ok}/${total}
⚠️ 异常模型: ${warn}/${total}
❌ 失败模型: ${err}/${total}
⏱️ 平均延迟: ${avg}ms
💡 提示: 失败模型可能需要检查API密钥或服务状态`;
  }
}
