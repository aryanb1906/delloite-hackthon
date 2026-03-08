@echo off
cd /d "c:\Users\KIIT0001\OneDrive\Desktop\minor project\ARTH-MITRA"

echo Resetting git merge state...
git merge --abort 2>nul

echo Configuring git...
git config core.editor "cmd /c exit 0"

echo Pulling latest changes with rebase...
git pull --rebase origin master

echo Staging files...
git add README.md backend/PERFORMANCE_METRICS.md

echo Checking git status...
git status

echo Committing changes...
git commit -m "Add comprehensive performance metrics to README and backend documentation - Shows RAG system benchmarks with 11K+ documents, 5x cache speedup, 100%% success rate"

echo Pushing to GitHub...
git push origin master

echo.
echo Done! Check the output above for any errors.
pause
