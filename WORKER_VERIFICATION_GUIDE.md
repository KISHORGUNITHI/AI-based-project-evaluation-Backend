# Worker Verification Guide

This guide helps you verify that all workers are functioning correctly in both development and production environments.

## Quick Status Check

### 1. Check Running Processes

**Local Development (Windows):**
```cmd
# Check if workers are running
tasklist | findstr "node"

# Check specific worker processes
tasklist | findstr "tsx"
```

**Production (Linux/Unix):**
```bash
# Check if workers are running
ps aux | grep worker

# Check specific processes
ps aux | grep "worker:doc"
ps aux | grep "worker:github"
ps aux | grep "worker:agent"
ps aux | grep "worker:notification"
```

### 2. Check Worker Logs

**Development:**
Workers output logs to their respective terminal windows. Look for:

```
[doc-worker] Starting...
✅ Connected to CloudAMQP
Listening on doc-analysis
```

**Production (PM2 or systemd):**
```bash
# If using PM2
pm2 logs worker-doc
pm2 logs worker-github
pm2 logs worker-agent
pm2 logs worker-notification

# If using systemd
journalctl -u worker-doc -f
journalctl -u worker-github -f
journalctl -u worker-agent -f
journalctl -u worker-notification -f
```

---

## Detailed Worker Health Checks

### Worker 1: Doc Worker

**Queue:** `doc-analysis`  
**Purpose:** Extracts text from PDF/PPT, runs DocumentAgent LLM  
**Consumes:** DocAnalysisJob  
**Publishes to:** `agent-run` (WorkerResultReadyJob)

**Health Indicators:**
```
✅ Connected to CloudAMQP
Listening on doc-analysis
[doc-worker] Processing evaluation <id>
[doc-worker] Extracted PDF:XXXXc PPT:XXXXc
[documentAgent] problemStatement len: XXX, features: X
[doc-worker] Saved documentAnalysis for <id>
Published message to agent-run
```

**Common Issues:**
- ❌ `PDF extraction failed` → Check reportUrl path exists
- ❌ `PPT extraction failed` → Check pptUrl path exists and officeparser installed
- ❌ Connection timeout → Check CLOUDAMQP_URL in .env

---

### Worker 2: GitHub Worker

**Queue:** `github-clone`  
**Purpose:** Clones GitHub repo, generates summary, runs GithubAgent LLM  
**Consumes:** GithubCloneJob  
**Publishes to:** `agent-run` (WorkerResultReadyJob)

**Health Indicators:**
```
✅ Connected to CloudAMQP
Listening on github-clone
[github-worker] Processing evaluation <id>
[GithubCloneService] Clone complete → <path>
[github-worker] Summary: XXXXc for https://github.com/...
[githubAgent] techStack: [...], complexity: medium
[github-worker] Saved codeAnalysis for <id>
Published message to agent-run
```

**Common Issues:**
- ❌ `Clone failed` → Check git is installed, GitHub URL is valid
- ❌ `Permission denied` → Check temp directory write permissions
- ❌ `Agent failed` → Check NIM_API_KEY or model availability

---

### Worker 3: Agent Worker (Critical - Fan-in Logic)

**Queue:** `agent-run`  
**Purpose:** Waits for BOTH doc + github results, runs final evaluation  
**Consumes:** WorkerResultReadyJob (from doc-worker AND github-worker)  
**Publishes to:** `notification`

**Health Indicators:**
```
✅ Connected to CloudAMQP
Listening on agent-run
[agent-worker] Signal from doc-worker for <id>
[agent-worker] Signal from github-worker for <id>
[agent-worker] Both results ready for <id> — running agents
[evaluationAgent] Final scores: aiScore=XX problem=X solution=X impl=X innov=X docs=X
[agent-worker] Complete for <id>
Published message to notification
```

**Race Condition Prevention (Fixed):**
```
✅ Atomic claim: updateMany with status check
✅ First signal wins, duplicate signals discarded
✅ No double evaluation runs
```

**Common Issues:**
- ⚠️ `Only partial results` → One worker hasn't finished yet (normal, will requeue)
- ❌ `Timed out waiting` (after 60 attempts × 5s = 5min) → One worker crashed
- ❌ `Already being processed — discarding duplicate` → Good! Race prevention working

---

### Worker 4: Notification Worker

**Queue:** `notification`  
**Purpose:** Sends notifications to team members  
**Consumes:** NotificationJob  
**Publishes to:** None (end of pipeline)

**Health Indicators:**
```
✅ Connected to CloudAMQP
Listening on notification
[notification-worker] Notifying X users for <id>
[notification-worker] All notifications sent for <id>
```

---

## RabbitMQ Queue Verification

### Check Queue Status (CloudAMQP Dashboard)

Visit: `https://lionfish.rmq.cloudamqp.com/`

**Expected State (Idle):**
| Queue Name | Ready | Unacked | Total | Consumers |
|------------|-------|---------|-------|-----------|
| doc-analysis | 0 | 0 | 0 | 1 |
| github-clone | 0 | 0 | 0 | 1 |
| agent-run | 0 | 0 | 0 | 1 |
| notification | 0 | 0 | 0 | 1 |

**During Active Evaluation:**
| Queue Name | Ready | Unacked | Total | Consumers |
|------------|-------|---------|-------|-----------|
| doc-analysis | 0 | 1 | 1 | 1 |
| github-clone | 0 | 1 | 1 | 1 |
| agent-run | 2 | 0 | 2 | 1 |
| notification | 0 | 1 | 1 | 1 |

**Red Flags:**
- ❌ Ready > 10 for 5+ minutes → Worker is stuck or crashed
- ❌ Consumers = 0 → Worker not running or disconnected
- ❌ evaluation-progress-* queues with 49+ messages → SSE client disconnected (harmless, will auto-delete)

---

## Database Verification

### Check Evaluation Status Flow

```sql
-- Check current evaluations and their status
SELECT 
  id, 
  status, 
  "pdfText" IS NOT NULL as has_pdf,
  "pptText" IS NOT NULL as has_ppt,
  "documentAnalysis" IS NOT NULL as has_doc_analysis,
  "codeAnalysis" IS NOT NULL as has_code_analysis,
  "aiScore",
  "createdAt",
  "updatedAt"
FROM "evaluation"
ORDER BY "createdAt" DESC
LIMIT 10;
```

**Expected Status Flow:**
1. `PENDING` → Evaluation created
2. `JUDGE_EVALUATING` → Judge assigned
3. `AI_EVALUATING` → AI pipeline triggered
4. `AI_COMPLETED` → AI scoring done
5. `COMPLETED` → Judge score + final score computed

**Check for Stuck Evaluations:**
```sql
-- Find evaluations stuck in AI_EVALUATING for > 10 minutes
SELECT id, status, "updatedAt"
FROM "evaluation"
WHERE status = 'AI_EVALUATING'
  AND "updatedAt" < NOW() - INTERVAL '10 minutes';
```

---

## End-to-End Pipeline Test

### Manual Test Script

Use the provided test script:

```bash
npm run test:workers
```

This script:
1. ✅ Publishes a test DocAnalysisJob
2. ✅ Publishes a test GithubCloneJob
3. ✅ Monitors RabbitMQ queues
4. ✅ Checks database for results
5. ✅ Verifies notification delivery

**Expected Output:**
```
[test] Publishing doc-analysis job...
[test] Publishing github-clone job...
[test] Waiting for workers...
[test] ✅ Doc worker completed in 3.2s
[test] ✅ GitHub worker completed in 5.1s
[test] ✅ Agent worker completed in 8.7s
[test] ✅ Notification worker completed in 0.3s
[test] Total pipeline time: 8.9s
```

---

## Monitoring & Alerts

### Key Metrics to Track

1. **Queue Depth:** Should be < 5 under normal load
2. **Processing Time:**
   - Doc worker: 2-5 seconds
   - GitHub worker: 3-8 seconds
   - Agent worker: 5-10 seconds
   - Notification worker: < 1 second
3. **Error Rate:** < 1% of evaluations should fail
4. **Consumer Count:** Each queue should have exactly 1 consumer

### Recommended Alerts

**Critical Alerts:**
- ❌ Any worker consumer count = 0 for > 1 minute
- ❌ Queue depth > 20 for > 5 minutes
- ❌ Evaluation stuck in `AI_EVALUATING` for > 15 minutes

**Warning Alerts:**
- ⚠️ Queue depth > 10 for > 2 minutes
- ⚠️ Processing time > 20 seconds
- ⚠️ Error rate > 5%

---

## Production Deployment Checklist

### Environment Variables
```bash
# Required for all workers
DATABASE_URL=postgresql://...
CLOUDAMQP_URL=amqps://...
NIM_API_KEY=nvapi-...
NIM_MODEL=meta/llama-3.1-8b-instruct

# Optional
LANGFUSE_PUBLIC_KEY=pk-...
LANGFUSE_SECRET_KEY=sk-...
LANGFUSE_HOST=https://...
```

### Start Commands (PM2 Example)

```bash
# Install PM2 globally
npm install -g pm2

# Start all workers
pm2 start npm --name "worker-doc" -- run worker:doc
pm2 start npm --name "worker-github" -- run worker:github
pm2 start npm --name "worker-agent" -- run worker:agent
pm2 start npm --name "worker-notification" -- run worker:notification

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup

# Monitor
pm2 monit
```

### Health Check Endpoints

Add to your Express server:

```typescript
// GET /health/workers
app.get('/health/workers', async (req, res) => {
  const channel = await connectRabbitMQ();
  
  const checks = {
    doc: await channel.checkQueue('doc-analysis'),
    github: await channel.checkQueue('github-clone'),
    agent: await channel.checkQueue('agent-run'),
    notification: await channel.checkQueue('notification'),
  };
  
  const allHealthy = Object.values(checks).every(q => q.consumerCount > 0);
  
  res.status(allHealthy ? 200 : 503).json({
    healthy: allHealthy,
    queues: checks,
    timestamp: new Date().toISOString(),
  });
});
```

---

## Troubleshooting Common Issues

### Issue 1: Double Evaluation (Fixed)

**Symptoms:**
- Two evaluation runs with slightly different scores
- Agent worker logs show duplicate processing

**Fix Applied:**
- ✅ Atomic `updateMany` claim in agent-worker.ts
- ✅ Status check: only one worker can claim the evaluation

**Verification:**
```bash
# Check agent-worker logs for "discarding duplicate"
grep "discarding duplicate" worker-agent.log
```

---

### Issue 2: Progress Events Lost (Fixed)

**Symptoms:**
- UI shows incomplete progress (missing "Code Analysis" step)
- SSE stream closes early

**Fix Applied:**
- ✅ Declare progress queue BEFORE publishing job
- ✅ Subscribe to queue BEFORE worker starts

**Verification:**
```bash
# Test SSE endpoint
curl -N http://localhost:5000/api/evaluation/{id}/trigger-ai
```

---

### Issue 3: Stuck Workers

**Symptoms:**
- Queue has messages but consumers = 0
- Worker logs show connection errors

**Diagnosis:**
```bash
# Check worker process
ps aux | grep worker:doc

# Check RabbitMQ connection
curl -u guest:guest http://localhost:15672/api/connections
```

**Fix:**
```bash
# Restart affected worker
pm2 restart worker-doc

# Or restart all
pm2 restart all
```

---

## Quick Commands Reference

```bash
# Start all workers (dev)
npm run worker:doc & 
npm run worker:github & 
npm run worker:agent & 
npm run worker:notification &

# Stop all workers (dev - Windows)
taskkill /F /IM node.exe

# Stop all workers (dev - Linux/Mac)
pkill -f "worker:"

# View live logs
tail -f logs/worker-*.log

# Monitor RabbitMQ
watch -n 2 'rabbitmqctl list_queues name messages consumers'

# Database query for stuck evaluations
psql $DATABASE_URL -c "SELECT id, status FROM evaluation WHERE status = 'AI_EVALUATING';"
```

---

## Success Indicators

✅ **All workers healthy:**
- 4 worker processes running
- 4 queues with 1 consumer each
- No stuck messages in RabbitMQ
- No stuck evaluations in database

✅ **Evaluation pipeline working:**
1. POST /api/evaluation/:id/trigger-ai returns SSE stream
2. Progress events arrive: starting → PDF Extraction → PPT Analysis → Document Analysis → Code Analysis → AI Scoring → Validation → done
3. Database shows status: PENDING → AI_EVALUATING → AI_COMPLETED
4. Team members receive notifications

✅ **No duplicate evaluations:**
- Agent worker logs show "discarding duplicate" messages
- Database shows only one AI score per evaluation (no multiple updates with different scores)

---

## Contact & Support

If workers fail after following this guide:
1. Check logs for error messages
2. Verify environment variables
3. Test RabbitMQ connectivity
4. Check database connection
5. Verify NIM API key and model availability

Last Updated: $(date)
