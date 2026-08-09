# Podcast System Improvements - Action Checklist

**Status Tracking:** 🔴 Not Started | 🟡 In Progress | 🟢 Complete | ⏸️ Blocked

---

## Week 1: Quick Wins (8-10 hours total)

### Day 1-2: Configuration Externalization
- [ ] 🔴 Create `config/tts.config.json` template
- [ ] 🔴 Add TTS environment variables to `.env.example`
- [ ] 🔴 Update `tts.service.ts` to read from config/env
- [ ] 🔴 Test voice switching without code changes
- [ ] 🔴 Document configuration options
- [ ] 🔴 Deploy to staging
- [ ] 🔴 Deploy to production

**Estimated Time:** 2-4 hours  
**Risk Level:** LOW ✅  
**Impact:** HIGH 🚀

### Day 3: Circuit Breaker
- [ ] 🔴 Install Cockatiel (already installed)
- [ ] 🔴 Create `tts.circuit-breaker.ts` wrapper
- [ ] 🔴 Wrap TTS calls with circuit breaker
- [ ] 🔴 Configure thresholds (5 failures, 60s cooldown)
- [ ] 🔴 Add monitoring for breaker state
- [ ] 🔴 Test failure scenarios
- [ ] 🔴 Deploy

**Estimated Time:** 2 hours  
**Risk Level:** LOW ✅  
**Impact:** HIGH 🚀

### Day 4: Enhanced Logging
- [ ] 🔴 Add TTS provider diagnostics
- [ ] 🔴 Add cost tracking per synthesis call
- [ ] 🔴 Add latency tracking per voice
- [ ] 🔴 Add error classification
- [ ] 🔴 Create log aggregation queries
- [ ] 🔴 Set up alerts for high error rates
- [ ] 🔴 Deploy

**Estimated Time:** 4 hours  
**Risk Level:** LOW ✅  
**Impact:** MEDIUM 📊

### Day 5: Request Deduplication
- [ ] 🔴 Add hash function for podcast requests
- [ ] 🔴 Check for existing generation before starting
- [ ] 🔴 Return existing podcast if in progress
- [ ] 🔴 Add cache expiry (24 hours)
- [ ] 🔴 Test duplicate request handling
- [ ] 🔴 Deploy

**Estimated Time:** 4 hours  
**Risk Level:** LOW ✅  
**Impact:** MEDIUM 💰

---

## Week 2-3: Provider Abstraction (1-2 days)

### Phase 1: Interface Design
- [ ] 🔴 Create `TTSProvider` interface
- [ ] 🔴 Define common types (`Voice`, `SynthesisRequest`, etc.)
- [ ] 🔴 Document interface contract
- [ ] 🔴 Design registry pattern

**Estimated Time:** 2 hours  
**Risk Level:** LOW ✅

### Phase 2: Refactor Current Provider
- [ ] 🔴 Extract `GoogleCloudTTSProvider` to separate file
- [ ] 🔴 Implement `TTSProvider` interface
- [ ] 🔴 Keep backward compatibility
- [ ] 🔴 Add unit tests
- [ ] 🔴 Verify no behavior changes

**Estimated Time:** 4 hours  
**Risk Level:** MEDIUM ⚠️

### Phase 3: Registry Implementation
- [ ] 🔴 Create `TTSProviderRegistry` class
- [ ] 🔴 Add provider registration
- [ ] 🔴 Add provider selection logic
- [ ] 🔴 Add fallback mechanism
- [ ] 🔴 Update `AudioComposer` to use registry
- [ ] 🔴 Test provider switching

**Estimated Time:** 4 hours  
**Risk Level:** MEDIUM ⚠️

### Phase 4: Testing & Documentation
- [ ] 🔴 Write unit tests for interface
- [ ] 🔴 Write integration tests
- [ ] 🔴 Update API documentation
- [ ] 🔴 Create migration guide
- [ ] 🔴 Deploy to staging
- [ ] 🔴 Smoke test all podcast types
- [ ] 🔴 Deploy to production

**Estimated Time:** 4 hours  
**Risk Level:** MEDIUM ⚠️

---

## Week 4: Cost Controls & Optimization (1 day)

### Cost Tracking System
- [ ] 🔴 Create cost tracking service
- [ ] 🔴 Track cost per podcast
- [ ] 🔴 Track cost per user (daily/monthly)
- [ ] 🔴 Store in Firestore analytics collection
- [ ] 🔴 Create cost dashboard query

**Estimated Time:** 3 hours

### Budget Enforcement
- [ ] 🔴 Add user budget limits (Firestore)
- [ ] 🔴 Check budget before generation
- [ ] 🔴 Reject if over budget
- [ ] 🔴 Send budget alert emails
- [ ] 🔴 Admin panel for budget management

**Estimated Time:** 4 hours

### Optimization
- [ ] 🔴 Implement segment caching (intro/outro)
- [ ] 🔴 Add compression options
- [ ] 🔴 Test lower bitrate quality
- [ ] 🔴 Measure actual savings

**Estimated Time:** 3 hours

---

## Q2 2025: Gemini 2.0 Preparation

### Monitoring Phase (Ongoing)
- [ ] ⏸️ Subscribe to Gemini 2.0 announcements
- [ ] ⏸️ Monitor beta feedback
- [ ] ⏸️ Track pricing announcements
- [ ] ⏸️ Review SDK updates

**Status:** WAITING FOR GA RELEASE

### Adapter Development (When GA)
- [ ] ⏸️ Install latest `@google/genai` SDK
- [ ] ⏸️ Create `GeminiTTSProvider` class
- [ ] ⏸️ Implement `TTSProvider` interface
- [ ] ⏸️ Handle streaming audio
- [ ] ⏸️ Voice mapping from Cloud TTS
- [ ] ⏸️ Error handling
- [ ] ⏸️ Unit tests

**Estimated Time:** 1 week  
**Trigger:** Gemini 2.0 GA announcement

### Pilot Testing (After Adapter)
- [ ] ⏸️ Deploy to staging
- [ ] ⏸️ Generate 10 test podcasts
- [ ] ⏸️ Quality comparison (blind test)
- [ ] ⏸️ Latency measurement
- [ ] ⏸️ Cost comparison
- [ ] ⏸️ Reliability testing (24-hour stress test)
- [ ] ⏸️ User feedback collection

**Estimated Time:** 1 week  
**Decision Point:** Proceed only if quality + cost better

### Production Rollout (If Approved)
- [ ] ⏸️ 5% traffic to Gemini
- [ ] ⏸️ Monitor metrics for 1 week
- [ ] ⏸️ 25% traffic if stable
- [ ] ⏸️ 50% traffic if stable
- [ ] ⏸️ 100% or rollback based on data
- [ ] ⏸️ Keep Cloud TTS as fallback

**Estimated Time:** 4 weeks  
**Risk Mitigation:** Gradual rollout with instant rollback

---

## Testing Checklist

### After Each Change
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Smoke test podcast generation
- [ ] Check voice quality manually
- [ ] Verify cost calculations
- [ ] Check logs for errors
- [ ] Verify storage uploads

### Before Production Deploy
- [ ] Full test suite green ✅
- [ ] Load test (10 concurrent generations)
- [ ] Staging validation complete
- [ ] Rollback plan documented
- [ ] Team notified
- [ ] Monitoring dashboards ready
- [ ] On-call engineer assigned

---

## Success Criteria

### Week 1 Completion
✅ Configuration moved to environment  
✅ Circuit breaker prevents cascades  
✅ Full cost visibility per podcast  
✅ No duplicate generations  

### Week 2-3 Completion  
✅ Provider abstraction complete  
✅ Easy provider switching  
✅ Fallback mechanism working  
✅ 100% test coverage  

### Week 4 Completion
✅ Budget controls enforced  
✅ Cost reduced by 15-25%  
✅ Cost alerts working  
✅ Optimization deployed  

### Q2 2025 (If Gemini GA)
✅ Gemini adapter complete  
✅ Quality comparison done  
✅ Migration decision made  
✅ Rollout plan approved  

---

## Rollback Procedures

### If Config Change Breaks System
```bash
# Revert environment variable
git checkout HEAD~1 .env
pm2 restart podcast-service
```

### If Provider Abstraction Fails
```bash
git revert <commit-hash>
npm run build
pm2 restart all
# Verify podcast generation works
```

### If Cost Controls Too Strict
```bash
# Adjust limits in Firestore
firebase firestore:update users/{userId} --data '{"podcastBudget": 10.00}'
```

### If Gemini Migration Fails
```bash
# Change provider in config
TTS_PROVIDER=google-cloud
pm2 restart all
# Verify 10 podcast generations
```

---

## Monitoring Dashboards

### Create These Views

**1. Generation Success Rate**
- Total generations (last 24h)
- Successful completions
- Failures by stage
- Success rate percentage

**2. Cost Dashboard**
- Total spend (today/week/month)
- Cost per podcast average
- Cost by provider
- Budget remaining

**3. Performance Dashboard**
- Average generation time
- TTS latency (p50, p95, p99)
- Queue depth
- Active jobs

**4. Quality Dashboard**
- Voice quality scores (if implemented)
- User playback completion rate
- Error rate by voice
- Retries per podcast

**5. Provider Health**
- API response times
- Error rates
- Circuit breaker state
- Fallback usage

---

## Communication Plan

### Before Starting
- [ ] Notify team of upcoming changes
- [ ] Schedule deployment window
- [ ] Assign on-call coverage

### During Implementation
- [ ] Daily standup updates
- [ ] Slack notifications for deploys
- [ ] Document any issues

### After Completion
- [ ] Summary email to stakeholders
- [ ] Update runbooks
- [ ] Knowledge sharing session

---

**Last Updated:** 2026-07-31  
**Owner:** Engineering Team  
**Next Review:** After Week 1 completion
