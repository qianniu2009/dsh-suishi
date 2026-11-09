#!/usr/bin/env node
/**
 * 下载香港天文台 1901–2100 公历年历原始文本（UTF-8，带 BOM）。
 *
 *   URL: https://www.hko.gov.hk/tc/gts/time/calendar/text/files/T{年}c.txt
 *   输出: tools/hko/raw/T{年}c.txt   （不随插件包发布）
 *
 * 用法:
 *   node tools/hko/fetch.mjs              # 下载 1901..2100，已存在且大小正常的跳过
 *   node tools/hko/fetch.mjs 1901 1910    # 只下载指定年份区间
 *
 * 说明:
 *   - 使用系统自带 curl（Windows 10+ / macOS / Linux 均可）。
 *   - 失败重试 3 次（退避 1s/2s），仍有缺失则 exit 1 并列出缺哪些年。
 *   - 原始文件大小约 23KB/年，200 个约 4.7MB。
 */
import { spawn } from 'node:child_process';
import { mkdirSync, existsSync, statSync, renameSync, rmSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, 'raw');
const BASE_URL = 'https://www.hko.gov.hk/tc/gts/time/calendar/text/files';
const MIN_BYTES = 5000; // 单年文件约 23KB；小于此视为下载失败
const CONCURRENCY = 6;
const MAX_ATTEMPTS = 3;

function rawPath(year) {
  return path.join(RAW_DIR, `T${year}c.txt`);
}

function isValidFile(year) {
  try {
    const st = statSync(rawPath(year));
    if (!st.isFile() || st.size < MIN_BYTES) return false;
    const text = readFileSync(rawPath(year), 'utf8');
    // 头部含 "{year}({干支} - {生肖})年公曆與農曆對照表"；数据行至少 360 行
    const lines = text.split('\n');
    const dataLines = lines.filter((l) => l.startsWith(`${year}年`)).length;
    return text.includes(`${year}`) && dataLines >= 360;
  } catch {
    return false;
  }
}

function curlDownload(url, outFile) {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      'curl',
      ['-sSL', '--fail', '--max-time', '180', '--retry', '2', '--retry-delay', '2', '-o', outFile, url],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let err = '';
    proc.stderr.on('data', (d) => {
      err += String(d);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`curl exit ${code}: ${err.trim().slice(0, 400)}`));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchYear(year, attempt = 1) {
  const url = `${BASE_URL}/T${year}c.txt`;
  const tmp = rawPath(year) + '.part';
  try {
    if (existsSync(tmp)) rmSync(tmp, { force: true });
    await curlDownload(url, tmp);
    const st = statSync(tmp);
    if (!st.isFile() || st.size < MIN_BYTES) throw new Error(`文件过小 (${st.size} bytes)，疑似错误页`);
    const text = readFileSync(tmp, 'utf8');
    const dataLines = text.split('\n').filter((l) => l.startsWith(`${year}年`)).length;
    if (dataLines < 360) throw new Error(`数据行只有 ${dataLines} 行`);
    renameSync(tmp, rawPath(year));
    return st.size;
  } catch (e) {
    rmSync(tmp, { force: true });
    if (attempt < MAX_ATTEMPTS) {
      await sleep(1000 * attempt);
      return fetchYear(year, attempt + 1);
    }
    throw new Error(`下载 T${year}c.txt 失败（${MAX_ATTEMPTS} 次）: ${e.message}`);
  }
}

async function main() {
  const argStart = Number(process.argv[2] ?? 1901);
  const argEnd = Number(process.argv[3] ?? 2100);
  if (!Number.isInteger(argStart) || !Number.isInteger(argEnd) || argStart < 1901 || argEnd > 2100 || argStart > argEnd) {
    throw new Error('参数应为 1901..2100 的年份区间，例如: node tools/hko/fetch.mjs 2020 2026');
  }

  mkdirSync(RAW_DIR, { recursive: true });
  console.log(`[hko] 原始目录: ${RAW_DIR}`);

  const todo = [];
  const skipped = [];
  for (let y = argStart; y <= argEnd; y += 1) {
    if (isValidFile(y)) skipped.push(y);
    else todo.push(y);
  }
  console.log(`[hko] 区间 ${argStart}..${argEnd}: 已就绪 ${skipped.length} 个，待下载 ${todo.length} 个`);

  let downloaded = 0;
  let bytes = 0;
  const failures = [];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, Math.max(1, todo.length)) }, async () => {
    for (;;) {
      const i = cursor;
      cursor += 1;
      if (i >= todo.length) return;
      const year = todo[i];
      try {
        const size = await fetchYear(year);
        downloaded += 1;
        bytes += size;
        process.stdout.write(`\r[hko] 下载 ${downloaded}/${todo.length}  (${year}年, ${size} bytes)      `);
      } catch (e) {
        failures.push(e.message);
      }
    }
  });
  await Promise.all(workers);
  process.stdout.write('\n');

  const missing = [];
  for (let y = argStart; y <= argEnd; y += 1) if (!isValidFile(y)) missing.push(y);

  if (failures.length) for (const f of failures) console.error(`  ✗ ${f}`);
  if (missing.length) {
    throw new Error(`原始文件缺失 ${missing.length} 个: ${missing.slice(0, 12).join(',')}${missing.length > 12 ? ' ...' : ''}`);
  }
  console.log(
    `[hko] 完成：${argEnd - argStart + 1} 个年份全部就绪（本次新下载 ${downloaded} 个，${(bytes / 1024).toFixed(1)} KiB；跳过 ${skipped.length} 个）`,
  );
}

main().catch((e) => {
  console.error('[hko] FATAL:', e.message);
  process.exit(1);
});
