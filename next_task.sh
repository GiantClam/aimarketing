#!/bin/bash
# 运行下一个待办任务

cd /Users/beihuang/Documents/github/aimarketing

# 获取下一个任务
task=$(python3 task_manager.py run-next 2>&1 || true)

echo "$task"
