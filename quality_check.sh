#!/bin/bash
# 代码质量检查脚本
# 在 Aider 执行后自动运行

cd /Users/beihuang/Documents/github/aimarketing

echo "🔍 Running Quality Checks"
echo "========================="

# 1. TypeScript 类型检查
echo ""
echo "1️⃣  TypeScript Type Check"
npx tsc --noEmit 2>&1 | head -20
TSC_STATUS=$?

# 2. ESLint 检查
echo ""
echo "2️⃣  ESLint Check"
npx eslint . --ext .ts,.tsx 2>&1 | head -30
LINT_STATUS=$?

# 3. Prettier 检查 (可选)
echo ""
echo "3️⃣  Prettier Check"
npx prettier --check . 2>&1 | head -10
PRETTIER_STATUS=$?

# 4. 测试运行
echo ""
echo "4️⃣  Running Tests"
npm test -- --passWithNoTests 2>&1 | tail -20
TEST_STATUS=$?

# 汇总
echo ""
echo "========================="
echo "📊 Quality Check Summary"
echo "========================="

if [ $TSC_STATUS -eq 0 ]; then
    echo "✅ TypeScript: PASSED"
else
    echo "❌ TypeScript: FAILED"
fi

if [ $LINT_STATUS -eq 0 ]; then
    echo "✅ ESLint: PASSED"
else
    echo "❌ ESLint: FAILED"
fi

if [ $PRETTIER_STATUS -eq 0 ]; then
    echo "✅ Prettier: PASSED"
else
    echo "⚠️  Prettier: NEEDS FORMATTING"
fi

if [ $TEST_STATUS -eq 0 ]; then
    echo "✅ Tests: PASSED"
else
    echo "⚠️  Tests: NO TESTS or FAILED"
fi

# 退出码
if [ $TSC_STATUS -eq 0 ] && [ $LINT_STATUS -eq 0 ]; then
    echo ""
    echo "🎉 All critical checks passed!"
    exit 0
else
    echo ""
    echo "⚠️  Some checks failed. Please review."
    exit 1
fi
