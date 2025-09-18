import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

export class NetEaseCloudComment extends plugin {
    constructor() {
        super({
            name: '语录定时推送',
            description: '每天定时推送各类语录',
            event: 'message',
            priority: 1,
            rule: [
                {
                    reg: /^(网易云热评|到点了|12点了)$/,
                    fnc: 'getRandomComment'
                },
                {
                    reg: '^#语录全群推送$',
                    fnc: 'manualPushAllGroups',
                    permission: 'master'
                },
                {
                    reg: '^#语录测试推送(\\d+)$',
                    fnc: 'testPush',
                    permission: 'master'
                },
                {
                    reg: '^#语录切换API(\\d+)$',
                    fnc: 'switchAPI',
                    permission: 'master'
                },
                {
                    reg: '^#语录API列表$',
                    fnc: 'showAPIList',
                    permission: 'master'
                }
            ]
        });
//api列表，如有侵权，请联系我删除
        this.apiList = [
            {
                name: 'mir6=6',
                url: 'https://api.mir6.com/api/yulu?txt=9&type=json',
                weight: 5
            },
            {
                name: 'mir6=1',
                url: 'https://api.mir6.com/api/yulu?txt=1&type=json',
                weight: 5
            },
            {
                name: 'mir6=8',
                url: 'https://api.mir6.com/api/yulu?txt=8&type=json',
                weight: 5
            },
            {
                name: 'mir6=11',
                url: 'https://api.mir6.com/api/yulu?txt=11&type=json',
                weight: 5
            },
            {
                name: 'mir6=16',
                url: 'https://api.mir6.com/api/yulu?txt=16&type=json',
                weight: 5
            },
            {
                name: 'mir6=17',
                url: 'https://api.mir6.com/api/yulu?txt=17&type=json',
                weight: 5
            },
            {
                name: 'mir6=18',
                url: 'https://api.mir6.com/api/yulu?txt=18&type=json',
                weight: 5
            },
            {
                name: 'aa1-wangyiyunreping',
                url: 'https://v.api.aa1.cn/api/api-wenan-wangyiyunreping/index.php?aa1=json',
                weight: 7
            },
            {
                name: '4qb-emowenan',
                url: 'https://api.4qb.cn/api/emowenan?type=json',
                weight: 7
            }
        ];

        this.currentAPI = 0;
        this.lunarApi = "https://www.36jxs.com/api/Commonweal/almanac?sun=";
        this.cacheFilePath = path.join(process.cwd(), 'data', 'lunar_cache.json');
        this.ensureCacheFileExists();

        this.task = {
            cron: '0 0 * * *',
            name: '语录定时推送',
            fnc: () => this.pushAllComments(),
            log: true
        };
    }

    ensureCacheFileExists() {
        const dir = path.dirname(this.cacheFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.cacheFilePath)) {
            fs.writeFileSync(this.cacheFilePath, JSON.stringify({}), 'utf-8');
        }
    }

    readCache() {
        try {
            return JSON.parse(fs.readFileSync(this.cacheFilePath, 'utf-8'));
        } catch (error) {
            console.error('读取缓存失败:', error);
            return {};
        }
    }

    writeCache(data) {
        try {
            fs.writeFileSync(this.cacheFilePath, JSON.stringify(data, null, 2), 'utf-8');
        } catch (error) {
            console.error('写入缓存失败:', error);
        }
    }

    getLocalTime() {
        const now = new Date();
        return {
            year: now.getFullYear(),
            month: now.getMonth() + 1,
            day: now.getDate(),
            hours: now.getHours(),
            minutes: now.getMinutes(),
            seconds: now.getSeconds(),
            weekday: now.getDay(),
            timestamp: now.getTime()
        };
    }

    formatLocalTime(timeObj) {
        return {
            dateStr: `${timeObj.year}-${String(timeObj.month).padStart(2,'0')}-${String(timeObj.day).padStart(2,'0')}`,
            timeStr: `${String(timeObj.hours).padStart(2,'0')}:${String(timeObj.minutes).padStart(2,'0')}:${String(timeObj.seconds).padStart(2,'0')}`,
            displayDate: `${timeObj.year}年${timeObj.month}月${timeObj.day}日`,
            weekdayStr: this.getWeekday(timeObj.weekday)
        };
    }

    getWeekday(dayIndex) {
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        return `星期${weekdays[dayIndex]}`;
    }

    async getLunarDate() {
        const localTime = this.getLocalTime();
        const { dateStr, timeStr, displayDate, weekdayStr } = this.formatLocalTime(localTime);

        // 清理过期缓存
        const cache = this.readCache();
        Object.keys(cache).forEach(cacheDate => {
            if (cacheDate !== dateStr) {
                delete cache[cacheDate];
            }
        });

        // 验证缓存有效性
        if (cache[dateStr]?.timestamp === localTime.timestamp) {
            console.log(`[时间校验] 使用缓存数据（系统时间:${timeStr}）`);
            return cache[dateStr];
        }

        try {
            console.log(`[时间校验] 请求最新数据（系统时间:${timeStr}）`);
            const response = await fetch(`${this.lunarApi}${dateStr}`);
            if (!response.ok) throw new Error(`请求失败: ${response.status}`);

            const data = await response.json();
            if (data.code !== 1 || !data.data) {
                throw new Error("API数据格式错误");
            }

            const lunarData = {
                timestamp: localTime.timestamp,
                date: displayDate,
                time: timeStr,
                weekday: weekdayStr,
                chineseEra: `${data.data.TianGanDiZhiYear}年【${data.data.LYear}年】`,
                lunarDate: `${data.data.LMonth}${data.data.LDay}`,
                cacheTime: Date.now()
            };

            cache[dateStr] = lunarData;
            this.writeCache(cache);
            return lunarData;

        } catch (error) {
            console.error("获取农历失败:", error);
            return {
                timestamp: localTime.timestamp,
                date: displayDate,
                time: timeStr,
                weekday: weekdayStr,
                chineseEra: "农历数据获取失败",
                lunarDate: "",
                cacheTime: Date.now()
            };
        }
    }

    selectRandomAPI() {
        const totalWeight = this.apiList.reduce((sum, api) => sum + api.weight, 0);
        let random = Math.random() * totalWeight;
        
        for (let i = 0; i < this.apiList.length; i++) {
            if (random < this.apiList[i].weight) {
                return i;
            }
            random -= this.apiList[i].weight;
        }
        return 0;
    }

    async fetchComment() {
        const apiIndex = this.selectRandomAPI();
        const api = this.apiList[apiIndex];
        
        try {
            const response = await fetch(api.url);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

            const data = await response.json();
            let comment = '';
            
            if (api.url.includes('mir6.com')) {
                if (data.code !== 200 || !data.text) {
                    throw new Error("API返回数据格式不正确");
                }
                comment = data.text.trim();
            } else if (api.url.includes('aa1.cn')) {
                // 处理aa1.cn API
                if (!Array.isArray(data) || data.length === 0 || !data[0].wangyiyunreping) {
                    throw new Error("API返回数据格式不正确");
                }
                comment = data[0].wangyiyunreping.trim();
            } else if (api.url.includes('4qb.cn')) {
                // 处理4qb.cn API
                if (data.code !== 1 || !data.text) {
                    throw new Error("API返回数据格式不正确");
                }
                comment = data.text.trim();
            } else {
                comment = data.text || data.content || data.msg || JSON.stringify(data);
            }

            return {
                comment,
                apiName: api.name
            };

        } catch (error) {
            console.error(`[${api.name}] 获取语录失败:`, error);
            throw error;
        }
    }

    async getRandomComment(e) {
        try {
            const { comment, apiName } = await this.fetchComment();
            const lunarData = await this.getLunarDate();
            
            const message = [
                `🕑${lunarData.date} ${lunarData.time} ${lunarData.weekday}`,
                `🗓️${lunarData.chineseEra} ${lunarData.lunarDate}`,
                `————————`,
                `${comment}`,
                `[来自:${apiName}]`
            ].join('\n');
            
            return e.reply(message);
            
        } catch (error) {
            console.error("获取语录失败:", error);
            return e.reply("暂时没有合适的语录，晚点再试试吧~");
        }
    }

    async testPush(e) {
        const groupId = e.msg.match(/^#语录测试推送(\d+)$/)[1];
        try {
            const { comment, apiName } = await this.fetchComment();
            const lunarData = await this.getLunarDate();
            
            const message = [
                `🕑${lunarData.date} ${lunarData.time} ${lunarData.weekday}`,
                `🗓️${lunarData.chineseEra} ${lunarData.lunarDate}`,
                `————————`,
                `${comment}`,
                `[测试推送 来自:${apiName}]`
            ].join('\n');
            
            await Bot.sendGroupMsg(groupId, message);
            e.reply(`已向群 ${groupId} 发送测试推送`);
            
        } catch (error) {
            console.error("测试推送失败:", error);
            e.reply(`测试推送失败: ${error.message}`);
        }
    }

    async manualPushAllGroups(e) {
        e.reply("开始执行全群语录推送，请稍候...");
        try {
            const startTime = Date.now();
            const lunarData = await this.getLunarDate();
            
            const { successCount, failCount } = await this.pushAllComments(true, lunarData);
            const timeUsed = ((Date.now() - startTime) / 1000).toFixed(1);
            
            e.reply(`全群推送完成！\n成功: ${successCount}个\n失败: ${failCount}个\n耗时: ${timeUsed}秒`);
            
        } catch (error) {
            console.error("手动推送失败:", error);
            e.reply(`全群推送失败: ${error.message}`);
        }
    }

    async pushAllComments(isManual = false, preloadedLunarData = null) {
        console.log(`[${isManual ? '手动' : '定时'}] 开始全群语录推送`);
        
        try {
            const res = await Bot.sendApi('get_group_list');
            if (res?.retcode !== 0 || !Array.isArray(res.data)) {
                throw new Error("获取群列表失败");
            }
            
            const allGroups = res.data.filter(group => group.group_id);
            console.log(`[语录推送] 共找到 ${allGroups.length} 个群组`);
            
            if (allGroups.length === 0) {
                console.log('[语录推送] 没有需要推送的群组');
                return { successCount: 0, failCount: 0 };
            }

            const lunarData = preloadedLunarData || await this.getLunarDate();
            let successCount = 0;
            let failCount = 0;
            
            for (let i = 0; i < allGroups.length; i++) {
                const group = allGroups[i];
                
                try {
                    console.log(`[${i+1}/${allGroups.length}] 正在向群 ${group.group_id} 推送...`);
                    const { comment, apiName } = await this.fetchComment();
                    
                    const message = [
                        `🕑${lunarData.date} ${lunarData.time} ${lunarData.weekday}`,
                        `🗓️${lunarData.chineseEra} ${lunarData.lunarDate}`,
                        `————————`,
                        `${comment}`,
                        `[${isManual ? '手动推送' : '每日推送'} 来自:${apiName}]`
                    ].join('\n');
                    
                    await Bot.sendGroupMsg(group.group_id, message);
                    successCount++;
                    
                    if (i < allGroups.length - 1) {
                        await new Promise(resolve => setTimeout(resolve, isManual ? 3000 : 2000));
                    }
                    
                } catch (error) {
                    console.error(`[推送失败] 群 ${group.group_id}:`, error);
                    failCount++;
                }
            }
            
            console.log(`[语录推送] 完成: 成功 ${successCount} 个, 失败 ${failCount} 个`);
            return { successCount, failCount };
            
        } catch (error) {
            console.error('[语录推送] 过程中出现异常:', error);
            throw error;
        }
    }

    async showAPIList(e) {
        let msg = ['当前配置的API列表:'];
        this.apiList.forEach((api, index) => {
            msg.push(`${index + 1}. ${api.name} (权重:${api.weight})`);
            msg.push(`   URL: ${api.url}`);
            msg.push(`   ${index === this.currentAPI ? '← 当前使用中' : ''}`);
        });
        msg.push(`\n使用 #语录切换API[编号] 切换当前API`);
        await e.reply(msg.join('\n'));
    }

    async switchAPI(e) {
        const index = parseInt(e.msg.match(/^#语录切换API(\d+)$/)[1]) - 1;
        if (index >= 0 && index < this.apiList.length) {
            this.currentAPI = index;
            await e.reply(`已切换到API: ${this.apiList[index].name}`);
        } else {
            await e.reply('无效的API编号，请使用#语录API列表查看可用API');
        }
    }
}
