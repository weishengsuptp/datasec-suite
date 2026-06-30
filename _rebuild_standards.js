// 把 standards-pdf.js 转成 Go 后端能用的 standards.json
const fs = require('fs');
const path = require('path');

const SRC = 'E:/jinrongdata/dsmm-tool-app/frontend/src/standards-pdf.js';
const OUT = 'E:/jinrongdata/dsmm-tool-app/data/standards.json';

// 用 vm 执行 standards-pdf.js 拿到 window.STANDARDS_PDF
const vm = require('vm');
const code = fs.readFileSync(SRC, 'utf8');
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const PDF = ctx.window.STANDARDS_PDF;

// 19 个子域 → 4 个大域映射（按之前 frontend/wails-mock.js 的顺序）
const DOMAIN_MAP = [
    { id: 'general', name: '通用数据安全保障', subIds: ['general_security'] },
    { id: 'classification', name: '数据分类分级管理', subIds: ['classification'] },
    { id: 'lifecycle', name: '数据生命周期安全', subIds: [
        'collect', 'storage', 'transit', 'usage', 'processing',
        'provision', 'entrust', 'disclosure', 'delete', 'destroy'
    ]},
    { id: 'operations', name: '数据安全运营保障', subIds: [
        'permission', 'backup', 'newtech', 'monitoring',
        'assessment', 'audit', 'incident'
    ]}
];

// 4 维度顺序
const DIMS = ['组织建设', '制度流程', '技术能力', '人员能力'];

// 子域中文名（从 standards-pdf.js 的注释拿）
const SUBNAME = {
    general_security: '通用数据安全保障',
    classification: '数据分类分级管理',
    collect: '数据收集',
    storage: '数据存储',
    transit: '数据传输',
    usage: '数据使用',
    processing: '数据加工',
    provision: '数据提供',
    entrust: '数据委托处理',
    disclosure: '数据公开披露',
    delete: '数据删除',
    destroy: '数据销毁',
    permission: '权限安全管理',
    backup: '数据备份与恢复',
    newtech: '新技术应用风险防控',
    monitoring: '数据安全风险监测',
    assessment: '数据安全风险评估',
    audit: '数据安全合规审计',
    incident: '数据安全应急响应与事件处置',
};

// 子域表号
const TABLENO = {
    general_security: '2', classification: '3',
    collect: '4', storage: '5', transit: '6', usage: '7', processing: '8',
    provision: '9', entrust: '10', disclosure: '11', delete: '12', destroy: '13',
    permission: '14', backup: '15', newtech: '16', monitoring: '17',
    assessment: '18', audit: '19', incident: '20',
};

// 子域 note
const SUBNOTE = {
    newtech: '本文件的新技术是指人工智能、量子计算等，在基础原理、实现范式与应用价值等方面呈现巨大潜力、高速发展态势，但在技术实践和行业应用方面尚未经过广泛、深入验证的前沿新兴科技。',
};

// 子域建设目标（PDF 5.1/6.1/7.X.1/8.X.1 目标段）
const SUBTARGET = {
    general_security: '金融从业机构通过构建和完善数据安全相关组织结构、岗位职责、制度规程、技术体系、人员配置等方面工作机制，明确本机构数据安全相关内设部门职责分工、岗位角色和人员分配、策略和规划设计、审批流程设定、技术应用方式、操作规程执行等工作部署，形成科学、系统、全面的数据安全管控体系，防范因策略、制度、技术等管理机制和防护措施的体系漏洞、策略缺失、使用不当或资源不足等问题造成的整体性、系统性数据安全风险。',
    classification: '金融从业机构结合自身数据资源情况，建立数据资源识别梳理及数据分类分级工作机制，系统、全面开展数据资源分类分级管理工作，建立并维护本机构数据资源目录，明确基于数据分类分级的差异化安全管理需求。',
    collect: '金融从业机构通过加强数据收集活动的安全管理，提升数据收集过程数据安全性及相关操作行为的合法性、真实性和准确性，防范数据源伪造、数据泄露、数据篡改等安全风险。',
    storage: '金融从业机构通过完善数据存储策略、配备存储安全技术等措施，加强数据存储过程的安全性，防范数据泄露、数据篡改、数据损毁等安全风险。',
    transit: '金融从业机构通过建立数据传输安全管理机制，采用数据加密、安全传输通道等技术措施，提升数据传输合规性和安全性的保障能力，防范数据泄露、数据篡改等安全风险。',
    usage: '金融从业机构通过建立数据访问、查询、修改、展示、导出等数据使用安全管理机制，明确权限最小化原则，并采取身份鉴别、访问控制、数据脱敏、数据水印、文件加密、操作日志留存等技术措施，提升数据使用合规性和安全性，防范数据滥用、数据泄露、数据篡改等安全风险。',
    processing: '金融从业机构通过建立数据加工安全管理机制，采取权限控制、数据脱敏、去标识化等技术措施，提升数据在清洗、转换、分析、挖掘、整合、汇聚融合等加工活动中的合规性和安全性，防范数据泄露、数据滥用等安全风险。',
    provision: '金融从业机构通过建立数据提供安全管理机制，明确数据提供方、数据接收方的数据安全相关权利和义务，及应具备的数据安全保护技术能力，并采取数据加密、数据脱敏等技术措施，提升数据提供的合规性和安全性，防范数据泄露、数据滥用、非法获取、非法利用等安全风险。',
    entrust: '金融从业机构通过建立数据委托处理安全管理机制，明确数据委托方、数据受托方的数据安全相关权利和义务及应具备的数据安全保护技术能力，并采取数据加密、数据脱敏等技术措施，提升数据委托处理的合规性和安全性，防范数据泄露、数据滥用、非法获取、非法利用等安全风险。',
    disclosure: '金融从业机构通过建立数据公开披露安全管理机制，并采取数据脱敏、数据水印等技术措施，提升数据公开披露的安全性，确保在指定渠道公开信息，防范数据泄露、数据篡改等安全风险。',
    delete: '金融从业机构通过建立数据删除安全管理机制，并采取数据删除有效性验证等技术措施，确保数据处于不可被检索、访问的状态，防范数据滥用、数据泄露等安全风险。',
    destroy: '金融从业机构通过建立数据销毁安全管理机制，对数据库、服务器、存储系统、终端设备和存储介质等采用覆写、消磁、焚毁等方法，确保数据不可恢复，防范因介质丢失导致的数据泄露风险。',
    permission: '金融从业机构通过用户授权、身份鉴别、访问控制等技术措施和管理机制，在数据处理活动各环节和数据应用过程构建可靠、有效的权限安全管理机制，对数据、终端、应用、系统的访问和使用等操作权限进行授权审批、用户身份识别和验证等安全管理，确保仅授权主体对其权限内的数据资源进行合法操作，防范因未授权访问、越权访问导致的数据泄露、数据篡改、数据滥用等安全风险。',
    backup: '金融从业机构通过构建完善的数据备份与恢复体系，确保数据在遭遇丢失、损毁、破坏或系统故障等意外情况时，能够及时、准确地恢复数据，保障数据可用性、业务连续性和稳定性。',
    newtech: '金融从业机构通过建立新技术在本机构落地应用过程的数据安全管理机制，健全数据安全领域新技术应用的风险识别和测试评估流程，保障新技术在数据生命周期全过程应用的合规性和安全性，有效防范新技术应用风险。',
    monitoring: '金融从业机构通过建立数据安全风险监测机制，全面监控和分析数据生命周期全过程的数据处理活动，发现、干预或处置数据异常操作、数据滥用等安全风险，降低数据安全事件的发生概率和数据安全风险的影响。',
    assessment: '金融从业机构通过开展数据安全风险评估，掌握本机构数据安全保护现状，识别数据安全工作中存在的问题与不足，发现数据资源面临的安全风险，并将评估结果与制度完善、技术升级、资源配置紧密联动，持续提升数据安全保护能力，降低数据非法获取、数据滥用等安全风险。',
    audit: '金融从业机构通过开展数据安全合规审计，审视本机构数据处理活动的合法合规性，评价数据安全管理制度的执行情况，并对数据安全威胁或数据安全事件进行追溯和分析，促进数据安全工作的及时改进和完善。',
    incident: '金融从业机构通过建立数据安全事件应急响应、处置及报送机制，确保在发生数据泄露、篡改、损毁或滥用等安全事件时，及时响应，快速识别定位问题、有效控制事件影响、及时处置并合规上报，最大限度降低数据安全事件危害。',
};

let total = 0;
const domains = DOMAIN_MAP.map(dom => ({
    id: dom.id,
    name: dom.name,
    subdomains: dom.subIds.map(sid => {
        const sub = { id: sid, name: SUBNAME[sid] || sid };
        if (TABLENO[sid]) sub.table_no = '表' + TABLENO[sid];
        if (SUBNOTE[sid]) sub.note = SUBNOTE[sid];
        if (SUBTARGET[sid]) sub.target = SUBTARGET[sid];
        sub.levels = {};
        for (let lv = 1; lv <= 5; lv++) {
            const lvl = {};
            for (const dim of DIMS) {
                const txt = PDF[sid]?.[dim]?.[lv];
                // null/undefined → null；"—" → null（让 Go 显示"沿用低一级"）
                if (txt === undefined || txt === null || txt === '—') {
                    lvl[dim] = null;
                } else {
                    lvl[dim] = String(txt);
                    total++;
                }
            }
            sub.levels[String(lv)] = lvl;
        }
        return sub;
    })
}));

const out = {
    metadata: {
        standard: 'JR/T 0358-2026',
        title: '金融数据安全 数据安全能力体系',
        issuer: '中国人民银行',
        issue_date: '2026-01-23',
        extract_source: 'vision_all.md',
        extract_method: 'vision_extraction + manual_concat',
        version: '1.0'
    },
    dimensions: DIMS,
    domains
};

fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
console.log('Wrote', OUT);
console.log('Total non-empty descriptions:', total, '/ 380 expected');
console.log('Domains:', domains.map(d => d.id + '(' + d.subdomains.length + ')').join(', '));
