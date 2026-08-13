import test from "node:test";
import assert from "node:assert/strict";
import { LocalChatService } from "../runtime/chat";

test("local chat service consumes framed OpenCode events from the host", async () => {
  const script = "process.stdin.on('data',()=>{const body=JSON.stringify({version:1,requestId:'r',ok:true,data:{event:{event:'text_delta',delta:'你好',runId:'run-1'}}});process.stdout.write(Buffer.byteLength(body,'utf8')+':'+body+'\\n');process.stdin.resume()})";
  const service = new LocalChatService({ hostExecutable: process.execPath, hostArgs: ["-e", script] });
  const result = await service.run({ prompt: "测试", runId: "run-1" });
  assert.equal(result.runId, "run-1");
  assert.deepEqual(result.events[0], { event: "text_delta", delta: "你好", runId: "run-1" });
});
