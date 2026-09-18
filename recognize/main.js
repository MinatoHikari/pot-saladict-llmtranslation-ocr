// DeepSeek / GLM 文字识别（OCR）插件 for Saladict (pot-desktop fork)
// main.js 为普通脚本（应用以 eval 方式加载），必须定义与 plugin_type 同名的 recognize 函数
// 配置项由 info.json 的 needs 声明：endpoint / customEndpoint / apiKey / model / thinking / ocrPrompt

var ENDPOINTS = {
    deepseek: 'https://api.deepseek.com',
    zai: 'https://api.z.ai/api/paas/v4',
    zai_coding: 'https://api.z.ai/api/coding/paas/v4',
    bigmodel: 'https://open.bigmodel.cn/api/paas/v4',
    bigmodel_coding: 'https://open.bigmodel.cn/api/coding/paas/v4',
    zen: 'https://opencode.ai/zen/v1',
    go: 'https://opencode.ai/zen/go/v1'
};

// pot 语言代码 -> 语言名（与 info.json 的 language 表保持一致）
var LANGUAGE = {
    auto: 'auto',
    zh_cn: 'Simplified Chinese',
    zh_tw: 'Traditional Chinese',
    yue: 'Cantonese',
    ja: 'Japanese',
    en: 'English',
    ko: 'Korean',
    fr: 'French',
    es: 'Spanish',
    ru: 'Russian',
    de: 'German',
    it: 'Italian',
    tr: 'Turkish',
    pt_pt: 'Portuguese',
    pt_br: 'Brazilian Portuguese',
    vi: 'Vietnamese',
    id: 'Indonesian',
    th: 'Thai',
    ms: 'Malay',
    ar: 'Arabic',
    hi: 'Hindi',
    mn_mo: 'Mongolian',
    mn_cy: 'Mongolian (Cyrillic)',
    km: 'Khmer',
    nb_no: 'Norwegian Bokmål',
    nn_no: 'Norwegian Nynorsk',
    fa: 'Persian',
    sv: 'Swedish',
    pl: 'Polish',
    nl: 'Dutch',
    uk: 'Ukrainian',
    he: 'Hebrew'
};

// 提示词显式禁止翻译与附加标签；Free OCR. 为 GLM 视觉模型的训练格式
var DEFAULT_OCR_PROMPT =
    'Free OCR. Recognize ALL text in the image and output it verbatim in the original language, keeping the original line breaks. ' +
    'Do NOT translate. Do NOT add any headings, labels (such as OCR Result or Translation), markdown formatting or explanations. ' +
    'Output only the recognized text.';

// 清洗模型自行附加的内容：剥离 OCR Result/识别结果 标签前缀；
// 出现 Translation/翻译 小节时丢弃该行及之后全部内容（模型自作主张的翻译）
function sanitizeOcrText(text) {
    var lines = String(text).split('\n');
    var out = [];
    for (var i = 0; i < lines.length; i++) {
        var trimmed = lines[i].replace(/\s+$/, '');
        if (/^(\*{1,2}|_{1,2})?\s*(translation|译文|翻译)\s*(\*{1,2}|_{1,2})?\s*[:：]\s*(\*{1,2}|_{1,2})?\s*/i.test(trimmed)) {
            break;
        }
        var label = trimmed.match(/^(\*{1,2}|_{1,2})?\s*(ocr\s*result|ocr结果|识别结果)\s*(\*{1,2}|_{1,2})?\s*[:：]\s*(\*{1,2}|_{1,2})?\s*/i);
        if (label) {
            var rest = trimmed.slice(label[0].length).trim();
            if (rest) out.push(rest);
            continue;
        }
        out.push(lines[i]);
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function isCustomEndpoint(config) {
    return (config.customEndpoint || '').trim().length > 0 || config.endpoint === 'custom';
}

// 配置界面的下拉框默认只"显示"第一项，用户不点选就不会写入配置，
// 因此所有配置项都必须在代码里兜底默认值
var DEFAULT_ENDPOINT = 'zai';

function resolveEndpoint(config) {
    return config.endpoint || DEFAULT_ENDPOINT;
}

function resolveBaseUrl(config) {
    var custom = (config.customEndpoint || '').trim();
    if (custom) return custom;
    var endpoint = resolveEndpoint(config);
    if (ENDPOINTS[endpoint]) return ENDPOINTS[endpoint];
    throw '接口地址配置无效（' + endpoint + '）：请在服务设置中重新选择接口';
}

function buildChatUrl(baseUrl) {
    var base = String(baseUrl).trim().replace(/\/+$/, '');
    if (/\/chat\/completions$/.test(base)) return base;
    return base + '/chat/completions';
}

function resolveModel(config, defaults) {
    var model = (config.model || '').trim();
    if (model) return model;
    if (isCustomEndpoint(config)) throw '使用自定义接口时请填写模型名称（如 DeepSeek-OCR 填 deepseek-ai/DeepSeek-OCR-GGUF）';
    return defaults[resolveEndpoint(config)] || defaults.glm;
}

function formatHttpError(res) {
    var status = res && res.status ? res.status : '未知';
    var detail = '';
    try {
        detail = JSON.stringify(res ? res.data : res);
    } catch (e) {
        detail = String(res && res.data);
    }
    if (detail === 'undefined' || detail === 'null') detail = '';
    return 'Http Request Error\nHttp Status: ' + status + '\n' + detail.slice(0, 800);
}

async function chatCompletion(options, body) {
    var config = (options && options.config) || {};
    var utils = (options && options.utils) || {};
    var apiKey = (config.apiKey || '').trim();
    if (!apiKey && !isCustomEndpoint(config)) {
        throw 'API Key 未配置：请在 偏好设置→服务设置 中填写 API Key';
    }
    var headers = { 'Content-Type': 'application/json' };
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;

    var url = buildChatUrl(resolveBaseUrl(config));

    if (typeof utils.tauriFetch === 'function') {
        var res = await utils.tauriFetch(url, {
            method: 'POST',
            headers: headers,
            body: { type: 'Json', payload: body }
        });
        if (!res || !res.ok) throw formatHttpError(res);
        return res.data;
    }

    // 兜底：旧版运行环境可能直接暴露 fetch API（body 需为字符串）
    if (typeof fetch !== 'function') {
        throw '插件运行环境缺少网络接口（tauriFetch / fetch）';
    }
    var res2 = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(body) });
    var data = null;
    try {
        data = await res2.json();
    } catch (e) {
        data = null;
    }
    if (!res2.ok) throw formatHttpError({ status: res2.status, data: data });
    return data;
}

function extractContent(data) {
    var choice = data && data.choices && data.choices[0];
    var message = choice && choice.message;
    var content = '';
    if (message && typeof message.content === 'string') {
        content = message.content;
    } else if (message && Array.isArray(message.content)) {
        content = message.content
            .map(function (p) {
                return p && typeof p.text === 'string' ? p.text : '';
            })
            .join('');
    }
    content = (content || '').trim();
    if (!content && message && message.reasoning_content) {
        content = String(message.reasoning_content).trim();
    }
    if (!content) {
        throw '接口未返回内容：' + String(JSON.stringify(data)).slice(0, 500);
    }
    return content.replace(/^"+|"+$/g, '').trim();
}

async function recognize(base64, lang, options) {
    options = options || {};
    var config = options.config || {};
    if (!base64) throw '未收到图片数据';

    // Zen 上没有 deepseek-v4.1-flash，视觉用 glm-5.3-flash；Go 用 stable 的 deepseek-v4.1-flash（均支持图片输入）
    var model = resolveModel(config, {
        deepseek: 'deepseek-flash',
        zai: 'glm-4.6v',
        zai_coding: 'glm-4.6v',
        bigmodel: 'glm-4.6v',
        bigmodel_coding: 'glm-4.6v',
        zen: 'glm-5.3-flash',
        go: 'deepseek-v4.1-flash',
        glm: 'glm-4.6v'
    });

    var customPrompt = (config.ocrPrompt || '').trim();
    var prompt = customPrompt || DEFAULT_OCR_PROMPT;

    // 注意：DeepSeek 要求图片只出现在 user 消息中
    var body = {
        model: model,
        stream: false,
        messages: [
            {
                role: 'user',
                content: [
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,' + base64 } },
                    { type: 'text', text: prompt }
                ]
            }
        ]
    };

    // GLM 系列支持 thinking 开关；默认关闭以加快识别，auto 则不发送该参数
    var thinking = (config.thinking || 'disabled').trim();
    if (/^glm/i.test(model) && thinking !== 'auto') {
        body.thinking = { type: thinking === 'enabled' ? 'enabled' : 'disabled' };
    }

    var data = await chatCompletion(options, body);
    return sanitizeOcrText(extractContent(data));
}
