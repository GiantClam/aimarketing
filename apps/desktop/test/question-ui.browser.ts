import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";
import { chromium } from "playwright";

// Explicit browser check: pnpm exec tsx --test test/question-ui.browser.ts
// All host commands are mocked at the real Tauri adapter boundary.
test("native question form replies, rejects, restores and isolates sessions through the bridge", async () => {
  const bundle = await build({
    stdin: {
      contents: `
        import React, { useState, StrictMode } from 'react';
        import { createRoot } from 'react-dom/client';
        import { NativeQuestions } from './native-questions';
        import { NativeRunQuestions } from './native-run-questions';
        import { createDesktopWorkbenchClient } from './workbench-client';
        const listeners = new Set();
        const pending = [{id:'q1', sessionID:'s1', questions:[
          {header:'渠道', question:'选择发布渠道', multiple:true, options:[{label:'网站',description:'官方网站'},{label:'邮件',description:'订阅通讯'}]},
          {header:'风格', question:'选择文案风格', custom:false, options:[{label:'正式',description:'商务沟通'},{label:'轻松',description:'日常交流'}]}
        ]}, {id:'q2',sessionID:'s2',questions:[{header:'需求',question:'描述你的需求',options:[]}]},
        {id:'q3',sessionID:'workflow-node-session',questions:[{header:'工作流',question:'确认工作流渠道',options:[{label:'发布',description:'继续执行'}]}]}];
        const commands = [];
        let failNext = false;
        const emit = frame => { const raw=JSON.stringify(frame); for (const listener of [...listeners]) listener({raw:raw.length+':'+raw}); };
        const bridge = {
          async invoke(command,args) {
            if (command === 'inspect_run') return {
              run:{id:'workflow-run',status:'running',started_at:'2026-09-06T00:00:00Z'},nodes:[],usage:[],
              events:[{sequence:1,event_type:'question_request',created_at:'2026-09-06T00:00:00Z',payload_json:JSON.stringify({event:'question_request',requestId:'q3',sessionId:'workflow-node-session',runId:'workflow-run',questions:pending.find(q=>q.id==='q3')?.questions})},
              {sequence:2,event_type:'question_request',created_at:'2026-09-06T00:00:00Z',payload_json:JSON.stringify({event:'question_request',requestId:'q4',sessionId:'other-node-session',runId:'other-run',questions:[{header:'Wrong',question:'Must not appear',options:[]}]})}]
            };
            if (command !== 'host_send') return;
            const frame=args.message;
            commands.push(frame);
            if (frame.type === 'question.list') {
              emit({requestId:frame.requestId,ok:true,data:{questions:pending.filter(q=>q.sessionID===frame.payload.sessionId)}});
            } else if (failNext) {
              failNext=false;
              emit({requestId:frame.requestId,ok:false,error:{message:'fixture retry'}});
            } else {
              const index=pending.findIndex(q=>q.id===frame.payload.requestId && q.sessionID===frame.payload.sessionId);
              if (index>=0) pending.splice(index,1);
              emit({requestId:frame.requestId,ok:true,data:{}});
            }
          },
          async listen(_event,handler) { listeners.add(handler); return ()=>listeners.delete(handler); }
        };
        const client=createDesktopWorkbenchClient(bridge,{go(){},replace(){},current(){return '/';}});
        function Fixture() {
          const [session,setSession]=useState('s1');
          const [open,setOpen]=useState(true);
          const [workflow,setWorkflow]=useState(false);
          return <><div id='transcript'>已有正文</div><button onClick={()=>setSession(session==='s1'?'s2':'s1')}>Switch session</button><button onClick={()=>setOpen(!open)}>Reopen session</button><button onClick={()=>setWorkflow(true)}>Workflow</button>{workflow ? <NativeRunQuestions client={client} runId='workflow-run' locale='zh' /> : open && <NativeQuestions key={session} client={client.questions} sessionId={session} locale='zh' />}</>;
        }
        window.fixture={commands,fail(){failNext=true;},listeners:()=>listeners.size};
        createRoot(document.getElementById('root')).render(<StrictMode><Fixture /></StrictMode>);
      `,
      loader: "tsx",
      resolveDir: fileURLToPath(new URL("../src/", import.meta.url)),
    },
    bundle: true,
    write: false,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"development"' },
  });
  const css = await readFile(new URL("../src/native-questions.css", import.meta.url), "utf8");
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/fixture.js" ? "text/javascript; charset=utf-8" : "text/html; charset=utf-8");
    response.end(request.url === "/fixture.js" ? bundle.outputFiles[0]!.text : `<!doctype html><html lang="zh"><meta charset="utf-8"><style>body{font-family:system-ui;background:#fafafa}${css}</style><div id="root"></div><script src="/fixture.js"></script></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.getByText("选择发布渠道", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "提交回答", exact: true }).isDisabled(), true);
    await page.getByRole("checkbox", { name: "网站 官方网站" }).check();
    await page.getByRole("checkbox", { name: "邮件 订阅通讯" }).check();
    await page.getByRole("textbox", { name: "其他回答" }).fill("海报");
    await page.getByRole("radio", { name: "正式 商务沟通" }).check();
    assert.equal(await page.getByRole("textbox").count(), 1);
    await page.getByRole("button", { name: "收起", exact: true }).click();
    await page.getByRole("button", { name: "打开待回答问题", exact: true }).click();
    assert.equal(await page.getByRole("textbox", { name: "其他回答" }).inputValue(), "海报");
    await page.evaluate(() => (window as unknown as { fixture: { fail(): void } }).fixture.fail());
    await page.getByRole("button", { name: "提交回答", exact: true }).click();
    await page.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("textbox", { name: "其他回答" }).inputValue(), "海报");
    await page.getByRole("button", { name: "提交回答", exact: true }).click();
    await page.locator(".native-questions").waitFor({ state: "detached" });
    const replies = await page.evaluate(() => (window as unknown as { fixture: { commands: Array<{ type: string; payload: unknown }> } }).fixture.commands.filter((frame) => frame.type === "question.reply"));
    assert.equal(replies.length, 2);
    assert.deepEqual(replies[1]!.payload, { sessionId: "s1", requestId: "q1", answers: [["网站", "邮件", "海报"], ["正式"]] });
    await page.getByRole("button", { name: "Switch session", exact: true }).click();
    await page.getByText("描述你的需求", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Reopen session", exact: true }).click();
    await page.locator(".native-questions").waitFor({ state: "detached" });
    await page.getByRole("button", { name: "Reopen session", exact: true }).click();
    await page.getByText("描述你的需求", { exact: true }).waitFor();
    await page.setViewportSize({ width: 390, height: 700 });
    const box = await page.locator(".native-questions").boundingBox();
    assert.ok(box && box.x >= 0 && box.x + box.width <= 390 && box.y >= 0);
    await page.getByRole("button", { name: "拒绝回答", exact: true }).click();
    await page.locator(".native-questions").waitFor({ state: "detached" });
    const commands = await page.evaluate(() => (window as unknown as { fixture: { commands: Array<{ type: string; payload: unknown }> } }).fixture.commands);
    assert.deepEqual(commands.filter((frame) => frame.type === "question.reject").map((frame) => frame.payload), [{ sessionId: "s2", requestId: "q2" }]);
    assert.equal(commands.some((frame) => frame.type === "session.prompt"), false);
    assert.equal(await page.locator("#transcript").innerText(), "已有正文");
    await page.getByRole("button", { name: "Workflow", exact: true }).click();
    await page.getByText("确认工作流渠道", { exact: true }).waitFor();
    assert.equal(await page.locator("[data-question-run='workflow-run']").count(), 1);
    assert.equal(await page.getByText("Must not appear", { exact: true }).count(), 0);
    await page.getByRole("radio", { name: "发布 继续执行" }).check();
    await page.getByRole("button", { name: "提交回答", exact: true }).click();
    await page.locator(".native-questions").waitFor({ state: "detached" });
    const workflowReply = await page.evaluate(() => (window as unknown as { fixture: { commands: Array<{ type: string; payload: unknown }> } }).fixture.commands.filter((frame) => frame.type === "question.reply").at(-1));
    assert.deepEqual(workflowReply?.payload, { sessionId: "workflow-node-session", requestId: "q3", answers: [["发布"]] });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
