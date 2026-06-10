#!/usr/bin/env node
/**
 * 自动化嵌入式 Python 准备脚本
 * 在打包前下载和配置嵌入式 Python 3.12
 * 用法: node scripts/prepare-embedded-python.js
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PYTHON_VERSION = '3.12.10';
const PYTHON_URL = `https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip`;
const PYTHON_DIR = path.join(__dirname, '../python');
const ZIP_FILE = path.join(PYTHON_DIR, 'python.zip');
const PYTHON_EXE = path.join(PYTHON_DIR, 'python.exe');

console.log('🔧 小土豆嵌入式 Python 准备工具 v1.0');
console.log(`📦 Python 版本: ${PYTHON_VERSION}`);
console.log(`📍 目标目录: ${PYTHON_DIR}\n`);

// 1. 检查是否已存在
if (fs.existsSync(PYTHON_EXE)) {
  console.log('✅ 嵌入式 Python 已存在，跳过下载');
  console.log(`   ${PYTHON_EXE}\n`);
  process.exit(0);
}

// 2. 创建目录
if (!fs.existsSync(PYTHON_DIR)) {
  console.log(`📁 创建目录: ${PYTHON_DIR}`);
  fs.mkdirSync(PYTHON_DIR, { recursive: true });
}

// 3. 下载
console.log(`⬇️  正在下载 Python ${PYTHON_VERSION}...`);
console.log(`   ${PYTHON_URL}\n`);

downloadFile(PYTHON_URL, ZIP_FILE, (err) => {
  if (err) {
    console.error(`\n❌ 下载失败: ${err.message}`);
    process.exit(1);
  }

  console.log(`✅ 下载完成: ${ZIP_FILE}\n`);

  // 4. 解压
  console.log('📦 解压 Python...');
  try {
    if (process.platform === 'win32') {
      // Windows: 使用 PowerShell 解压
      execSync(
        `powershell -NoProfile -Command "Expand-Archive -Path '${ZIP_FILE}' -DestinationPath '${PYTHON_DIR}' -Force"`,
        { stdio: 'inherit' }
      );
    } else {
      // macOS/Linux: 使用 unzip
      execSync(`unzip -q "${ZIP_FILE}" -d "${PYTHON_DIR}"`, { stdio: 'inherit' });
    }
    console.log('✅ 解压完成\n');
  } catch (e) {
    console.error(`\n❌ 解压失败: ${e.message}`);
    process.exit(1);
  }

  // 5. 清理 zip
  try {
    fs.unlinkSync(ZIP_FILE);
    console.log('🗑️  已删除临时文件\n');
  } catch (e) {
    console.warn(`⚠️  无法删除 ${ZIP_FILE}: ${e.message}\n`);
  }

  // 6. 验证
  if (!fs.existsSync(PYTHON_EXE)) {
    console.error(`❌ Python 解压失败，未找到 ${PYTHON_EXE}`);
    process.exit(1);
  }

  // 7. 解锁嵌入式 Python 的 site-packages 和 pip
  console.log('🔧 解锁嵌入式 Python...');
  const pthFile = path.join(PYTHON_DIR, `python${PYTHON_VERSION.split('.').slice(0,2).join('')}._pth`);
  const libDir = path.join(PYTHON_DIR, 'Lib');
  const sitePackagesDir = path.join(libDir, 'site-packages');

  if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
  if (!fs.existsSync(sitePackagesDir)) fs.mkdirSync(sitePackagesDir, { recursive: true });

  if (fs.existsSync(pthFile)) {
    let pthContent = fs.readFileSync(pthFile, 'utf-8');
    if (pthContent.includes('#import site') || !pthContent.includes('import site')) {
      pthContent = pthContent.replace('#import site', 'import site');
      if (!pthContent.includes('Lib\\site-packages')) {
        pthContent = pthContent.trimEnd() + '\nLib\nLib\\site-packages\n';
      }
      fs.writeFileSync(pthFile, pthContent);
      console.log('✅ 已解锁 import site 和 site-packages\n');
    }
  }

  // 8. 安装 pip (get-pip.py)
  console.log('📦 安装 pip...');
  const getPipPath = path.join(PYTHON_DIR, 'get-pip.py');
  try {
    execSync(`"${PYTHON_EXE}" -m pip --version`, { stdio: 'pipe', timeout: 10000 });
    console.log('✅ pip 已存在\n');
  } catch (_) {
    console.log('   下载 get-pip.py...');
    try {
      execSync(`curl -sS https://bootstrap.pypa.io/get-pip.py -o "${getPipPath}"`, { stdio: 'inherit', timeout: 60000 });
      execSync(`"${PYTHON_EXE}" "${getPipPath}" --no-warn-script-location`, { stdio: 'inherit', timeout: 120000 });
      try { fs.unlinkSync(getPipPath); } catch (_) {}
      console.log('✅ pip 安装完成\n');
    } catch (e) {
      console.error(`❌ pip 安装失败: ${e.message}\n`);
      process.exit(1);
    }
  }

  // 9. 安装 setuptools + wheel
  console.log('📦 安装 setuptools + wheel...');
  try {
    execSync(`"${PYTHON_EXE}" -m pip install setuptools wheel --no-warn-script-location`, {
      stdio: 'inherit',
      timeout: 120000,
    });
    console.log('✅ setuptools + wheel 已安装\n');
  } catch (e) {
    console.warn(`⚠️  安装失败: ${e.message}\n`);
  }

  // 10. 安装后端依赖
  console.log('📦 安装后端依赖...');
  const backendReqFile = path.join(__dirname, '..', 'backend', 'requirements.txt');
  const rootReqFile = path.join(__dirname, '..', '..', 'requirements.txt');

  const reqFile = fs.existsSync(backendReqFile) ? backendReqFile : rootReqFile;

  if (!fs.existsSync(reqFile)) {
    console.warn(`⚠️  找不到 requirements.txt: ${reqFile}`);
    console.log('   跳过依赖安装，需要手动运行:');
    console.log(`   "${PYTHON_EXE}" -m pip install -r "${rootReqFile}"\n`);
  } else {
    try {
      execSync(
        `"${PYTHON_EXE}" -m pip install -r "${reqFile}" --no-warn-script-location`,
        {
          stdio: 'inherit',
          timeout: 600000, // 10 分钟（chromadb等大包需要更长时间）
        }
      );
      console.log('✅ 依赖安装完成\n');
    } catch (e) {
      console.error(`\n❌ 依赖安装失败: ${e.message}`);
      console.log('\n🔧 手动修复:');
      console.log(`   "${PYTHON_EXE}" -m pip install -r "${reqFile}"\n`);
      process.exit(1);
    }
  }

  // 11. 验证关键模块
  console.log('🔍 验证关键模块...');
  try {
    const testCode = 'import fastapi, uvicorn, openai, chromadb, tiktoken, httpx, aiohttp, cryptography, edge_tts, numpy, PIL; print("ALL_OK")';
    const result = execSync(`"${PYTHON_EXE}" -c "${testCode}"`, { stdio: 'pipe', timeout: 30000 });
    if (result.toString().trim() === 'ALL_OK') {
      console.log('✅ 所有关键模块验证通过\n');
    }
  } catch (e) {
    console.warn(`⚠️  模块验证失败: ${e.message}\n`);
  }

  console.log('═══════════════════════════════════════════════════════');
  console.log('✅ 嵌入式 Python 准备完成！');
  console.log('═══════════════════════════════════════════════════════');
  console.log(`\n📌 Python 位置: ${PYTHON_EXE}`);
  console.log(`   现在可以运行: npm run pack:win\n`);
});

/**
 * 下载文件
 */
function downloadFile(url, dest, callback) {
  const file = fs.createWriteStream(dest);
  let totalSize = 0;
  let downloadedSize = 0;

  https
    .get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // 重定向
        return downloadFile(response.headers.location, dest, callback);
      }

      if (response.statusCode !== 200) {
        callback(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      totalSize = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        const percent = Math.round((downloadedSize / totalSize) * 100);
        process.stdout.write(`\r   下载进度: ${percent}% (${formatBytes(downloadedSize)}/${formatBytes(totalSize)})`);
      });

      response.pipe(file);
    })
    .on('error', (err) => {
      fs.unlink(dest, () => {});
      callback(err);
    });

  file.on('finish', () => {
    file.close(callback);
  });

  file.on('error', (err) => {
    fs.unlink(dest, () => {});
    callback(err);
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
