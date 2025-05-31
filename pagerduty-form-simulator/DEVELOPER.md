# PagerDuty Event Definition System - Developer Guide

## Table of Contents

1. [System Overview](#system-overview)
2. [Schema Reference](#schema-reference)
3. [Creating Realistic Scenarios](#creating-realistic-scenarios)
4. [LLM-Assisted Scenario Generation](#llm-assisted-scenario-generation)
5. [Best Practices](#best-practices)
6. [Implementation Examples](#implementation-examples)
7. [Validation and Testing](#validation-and-testing)

## System Overview

The PagerDuty Event Definition System is a JSON-based framework for creating realistic incident simulation scenarios. It allows you to define sequences of monitoring alerts that execute with proper timing and escalation patterns.

### Core Components

- **Event Definitions**: JSON files containing scenario configurations
- **Event Processor**: Engine that executes scenarios and sends PagerDuty API calls
- **Variable System**: Template substitution for dynamic content
- **Timing Engine**: Sophisticated delay and randomization controls

### Use Cases

- **Training**: Realistic incident response drills
- **Testing**: Validate alerting and escalation policies
- **Demos**: Consistent, professional incident simulations
- **Load Testing**: Stress-test PagerDuty integrations
- **Documentation**: Living examples of incident patterns

## Schema Reference

### Root Structure
```json
{
  "schema_version": "1.0",
  "global_config": {
    "variables": {...},
    "routing_key_mappings": {...}
  },
  "event_definitions": [...]
}
```

### Event Definition Structure
```json
{
  "id": "unique_scenario_id",
  "name": "Human Readable Name",
  "description": "Detailed scenario description",
  "variables": {...},
  "events": [...]
}
```

### Event Structure
```json
{
  "type": "trigger|acknowledge|resolve|change",
  "summary": "Alert summary text",
  "severity": "critical|error|warning|info",
  "component": "service-name",
  "group": "logical-grouping",
  "class": "alert-classification",
  "dedup_key": "optional-deduplication-key",
  "custom_details": {...},
  "delay": {...}
}
```

### Delay Configuration
```json
{
  "type": "fixed|random|exponential",
  "value": 300,           // for fixed delays (seconds)
  "min": 60,              // for random delays
  "max": 300,             // for random delays
  "base": 30,             // for exponential delays
  "multiplier": 2,        // for exponential delays
  "max": 600              // for exponential max cap
}
```

## Creating Realistic Scenarios

### 1. Start with Real Monitoring Data

Base scenarios on actual alerts from your monitoring stack:

```json
{
  "summary": "API response time > 2s threshold exceeded",
  "custom_details": {
    "metric": "http_request_duration_p95",
    "current_value": "3.7s",
    "threshold": "2.0s",
    "endpoint": "/api/v1/users",
    "monitoring_tool": "Prometheus",
    "query": "histogram_quantile(0.95, http_request_duration_seconds_bucket)"
  }
}
```

### 2. Use Industry-Appropriate Terminology

**Finance Example:**
```json
{
  "summary": "Order execution error rate > 1% threshold",
  "custom_details": {
    "failed_orders_count": 23,
    "error_types": "TIMEOUT,INVALID_SYMBOL,INSUFFICIENT_FUNDS",
    "regulatory_impact": "trade reporting delay"
  }
}
```

**E-commerce Example:**
```json
{
  "summary": "Shopping cart service error rate > 2% threshold",
  "custom_details": {
    "primary_error": "DynamoDB ProvisionedThroughputExceededException",
    "failed_amount_usd": 47000,
    "peak_traffic_multiplier": "4x normal"
  }
}
```

### 3. Model Realistic Cascade Patterns

Incidents rarely happen in isolation. Model how problems spread:

```json
{
  "events": [
    {
      "summary": "Database connection pool exhausted",
      "severity": "critical",
      "delay": {"type": "fixed", "value": 0}
    },
    {
      "summary": "API gateway timeout errors increasing",
      "severity": "error", 
      "delay": {"type": "random", "min": 120, "max": 300}
    },
    {
      "summary": "Customer-facing service degraded",
      "severity": "warning",
      "delay": {"type": "random", "min": 200, "max": 500}
    }
  ]
}
```

### 4. Include Proper Monitoring Context

Each alert should include details a real monitoring tool would provide:

```json
{
  "custom_details": {
    "metric": "cpu_utilization_percent",
    "current_value": "94.2%",
    "threshold": "85.0%",
    "hostname": "web-server-prod-03",
    "monitoring_tool": "CloudWatch",
    "alarm_arn": "arn:aws:cloudwatch:us-east-1:123456789012:alarm:HighCPU",
    "dashboard": "https://console.aws.amazon.com/cloudwatch/home#alarmsV2:",
    "runbook": "https://wiki.company.com/runbooks/high-cpu"
  }
}
```

## LLM-Assisted Scenario Generation

### Prompt Engineering for Scenario Creation

Use structured prompts to generate realistic scenarios with LLMs:

#### Basic Scenario Generation Prompt

```
Create a PagerDuty event definition scenario for a [INDUSTRY] company experiencing [INCIDENT_TYPE].

Requirements:
- Use realistic monitoring alert summaries (not narrative descriptions)
- Include proper technical metrics with current values and thresholds
- Reference actual monitoring tools (Prometheus, DataDog, CloudWatch, etc.)
- Follow this JSON schema: [PASTE_SCHEMA]
- Create a cascade of 3-5 related alerts with realistic timing delays
- Include industry-specific terminology and business impact metrics

Industry: E-commerce
Incident Type: Payment processing failure during Black Friday

Focus on these technical areas:
- API response times and error rates
- Database connection issues
- Payment gateway timeouts
- CDN performance problems
```

#### Advanced Prompt for Industry-Specific Scenarios

```
Generate a realistic PagerDuty event scenario for [SPECIFIC_INDUSTRY_VERTICAL].

Context:
- Company: [COMPANY_TYPE] 
- System: [SYSTEM_DESCRIPTION]
- Incident Pattern: [INCIDENT_PATTERN]
- Business Impact: [IMPACT_DESCRIPTION]

Technical Requirements:
1. Alert summaries must read like actual monitoring tool outputs
2. Include specific metric names, current values, and thresholds  
3. Reference real monitoring tools and their output formats
4. Use proper technical terminology for the industry
5. Model realistic failure cascade timing (30s to 20min delays)
6. Include business context in custom_details

Industry-Specific Requirements:
[INDUSTRY]: [SPECIFIC_REQUIREMENTS]

Example for Finance:
- Include regulatory reporting implications
- Reference trading symbols and market data
- Use financial system terminology (order execution, risk management)
- Include compliance and audit trail information

Generate JSON following this exact schema:
[PASTE_COMPLETE_SCHEMA]
```

#### Prompt Template for Different Industries

**Finance/Trading:**
```
Create alerts for a financial trading platform experiencing issues during market hours.

Include:
- Market data feed latency alerts
- Order execution failures with financial impact
- Risk management system issues
- Regulatory compliance implications
- Trading symbol references (AAPL, MSFT, etc.)
- Market session context (pre-market, active trading, after-hours)
```

**Gaming:**
```
Create alerts for a multiplayer gaming platform during peak hours.

Include:
- Matchmaking queue performance issues
- Game server resource alerts (CPU, memory, network)
- Player experience metrics (latency, disconnections)
- Monetization system failures (in-game purchases)
- Anti-cheat system alerts
- Concurrent player counts and regional distribution
```

**E-commerce:**
```
Create alerts for an e-commerce platform during a major sale event.

Include:
- Website performance degradation under load
- Shopping cart and checkout failures
- Payment processing issues with financial impact
- Inventory system problems
- CDN and caching layer issues
- Customer experience metrics
```

**Automotive:**
```
Create alerts for a connected vehicle platform.

Include:
- Vehicle connectivity and telematics issues
- Safety-critical service failures (emergency calling)
- Navigation and mapping service problems
- Over-the-air update system alerts
- IoT device offline alerts
- Manufacturing system integration issues
```

### LLM Refinement Techniques

#### Iterative Improvement Prompts

```
Improve this PagerDuty scenario to make it more realistic:

[PASTE_CURRENT_SCENARIO]

Make these specific improvements:
1. Replace generic descriptions with specific monitoring tool outputs
2. Add realistic metric names and values
3. Include proper error codes and technical details
4. Adjust timing delays to be more realistic for human response
5. Add industry-specific business impact context
6. Ensure alert summaries read like actual monitoring alerts

Focus on technical accuracy and real-world plausibility.
```

#### Validation Prompts

```
Review this PagerDuty event scenario for realism and technical accuracy:

[PASTE_SCENARIO]

Check for:
1. Do the alert summaries sound like real monitoring tools?
2. Are the metric names and values realistic?
3. Do the timing delays make sense for incident response?
4. Is the technical terminology correct for the industry?
5. Are the monitoring tool references accurate?
6. Do the alerts follow a logical cascade pattern?

Provide specific feedback and suggest improvements.
```

### Multi-Step Generation Process

1. **Generate Base Scenario**
   - Use industry-specific prompt
   - Get initial scenario structure

2. **Refine Technical Details**
   - Focus on monitoring tool accuracy
   - Improve metric names and values
   - Add realistic error codes

3. **Validate Business Context**
   - Ensure industry terminology is correct
   - Add appropriate business impact metrics
   - Include regulatory/compliance context

4. **Test Scenario Logic**
   - Verify cascade timing makes sense
   - Check alert severity progression
   - Ensure deduplication keys are logical

### Sample LLM Conversation

**Human:** "Create a realistic PagerDuty scenario for a fintech payment processor experiencing issues during a flash sale event."

**LLM Response Structure:**
```json
{
  "id": "fintech_payment_surge",
  "name": "Payment Processor Flash Sale Overload",
  "description": "Payment processing system alerts during unexpected traffic surge",
  "events": [
    {
      "type": "trigger",
      "summary": "Payment API response time > 3s threshold exceeded",
      "severity": "warning",
      "custom_details": {
        "metric": "payment_api_response_time_p99",
        "current_value": "4.7s",
        "threshold": "3.0s",
        "endpoint": "/api/v2/payments/process",
        "monitoring_tool": "New Relic",
        "transaction_volume": "12,000 TPS vs normal 2,000 TPS"
      }
    }
    // ... more alerts
  ]
}
```

**Follow-up Refinement:** "Make the monitoring details more specific to actual payment processing tools and add PCI compliance context."

## Best Practices

### Scenario Design

1. **Start with Real Incidents**
   - Base scenarios on actual outages you've experienced
   - Interview teams about their most challenging incidents
   - Review post-mortem documents for realistic patterns

2. **Use Authentic Monitoring Data**
   - Copy actual alert formats from your monitoring tools
   - Include real metric names and typical threshold values
   - Reference actual dashboard URLs and runbook links

3. **Model Human Response Times**
   - Initial detection: 1-5 minutes
   - Acknowledgment: 5-15 minutes  
   - Investigation: 15-45 minutes
   - Resolution: 30 minutes - 4 hours

### Technical Accuracy

1. **Monitoring Tool Fidelity**
   ```json
   // Good - specific and realistic
   "monitoring_tool": "Prometheus",
   "query": "rate(http_requests_total{status=~\"5..\"}[5m])",
   "alert_manager_url": "https://alertmanager.company.com/#/alerts"
   
   // Bad - too generic
   "monitoring_tool": "monitoring system",
   "error": "high error rate detected"
   ```

2. **Realistic Metrics**
   ```json
   // Good - specific values and context
   "cpu_usage": "94.2%",
   "normal_range": "15-25%",
   "duration": "last 8 minutes"
   
   // Bad - vague descriptions  
   "cpu_usage": "very high",
   "performance": "degraded"
   ```

### Business Context

1. **Industry-Specific Impact**
   - Finance: Regulatory reporting requirements, trading halts
   - Healthcare: Patient safety implications, HIPAA concerns
   - Gaming: Player experience metrics, revenue per user impact
   - E-commerce: Cart abandonment rates, conversion impact

2. **Stakeholder Communication**
   - Include customer impact statements
   - Reference SLA violations
   - Mention revenue or cost implications

## Implementation Examples

### Simple Monitoring Alert
```json
{
  "type": "trigger",
  "summary": "High memory usage on web server cluster",
  "severity": "warning",
  "component": "web-application",
  "group": "infrastructure",
  "class": "resource-usage",
  "custom_details": {
    "metric": "memory_utilization_percent",
    "current_value": "87.3%",
    "threshold": "80.0%",
    "affected_hosts": ["web-01", "web-02", "web-03"],
    "monitoring_tool": "DataDog",
    "dashboard": "https://app.datadoghq.com/dash/web-servers",
    "duration": "5 minutes above threshold"
  }
}
```

### Complex Cascade Scenario
```json
{
  "id": "database_cascade",
  "name": "Database Performance Cascade",
  "events": [
    {
      "summary": "Database slow query threshold exceeded",
      "severity": "warning",
      "custom_details": {
        "slowest_query_time": "12.7s",
        "query": "SELECT * FROM orders WHERE customer_id = ?",
        "affected_table": "orders",
        "monitoring_tool": "pgBadger"
      },
      "delay": {"type": "fixed", "value": 0}
    },
    {
      "summary": "Database connection pool 90% utilization",
      "severity": "error", 
      "custom_details": {
        "active_connections": 90,
        "max_connections": 100,
        "wait_count": 23,
        "monitoring_tool": "PgBouncer"
      },
      "delay": {"type": "random", "min": 180, "max": 420}
    },
    {
      "summary": "API response time SLA breach",
      "severity": "critical",
      "custom_details": {
        "sla_threshold": "2.0s",
        "current_p95": "8.3s",
        "affected_endpoints": ["/orders", "/customers"],
        "monitoring_tool": "Elastic APM"
      },
      "delay": {"type": "random", "min": 300, "max": 600}
    }
  ]
}
```

## Validation and Testing

### Schema Validation
```json
{
  "required_fields": [
    "schema_version",
    "event_definitions"
  ],
  "event_required_fields": [
    "id", "name", "events"
  ],
  "alert_required_fields": [
    "type", "summary", "severity", "component"
  ]
}
```

### Realistic Content Checks
- Alert summaries should not contain narrative descriptions
- Metric values should be plausible for the system type
- Timing delays should reflect realistic human response patterns
- Business impact should be quantified where possible
- Monitoring tool references should be accurate

### Testing Methodology

1. **Dry Run Testing**
   - Execute scenarios in dry-run mode
   - Verify JSON structure and variable substitution
   - Check timing calculations

2. **Staging Environment**
   - Use test PagerDuty services
   - Validate API integration
   - Test escalation policies

3. **Team Review**
   - Have domain experts review scenarios for accuracy
   - Validate business impact statements
   - Confirm technical terminology

### Quality Checklist

- [ ] Alert summaries read like actual monitoring tool outputs
- [ ] Metric names and values are realistic and specific  
- [ ] Business impact is quantified and industry-appropriate
- [ ] Timing delays reflect realistic human response patterns
- [ ] Technical terminology is accurate for the industry
- [ ] Monitoring tool references are correct and specific
- [ ] Cascade patterns follow logical cause-and-effect relationships
- [ ] Severity levels progress appropriately
- [ ] Custom details include actionable troubleshooting information
- [ ] Variable substitution works correctly

## Advanced Techniques

### Dynamic Scenario Generation
Use LLMs to generate scenarios based on real-time system state:

```python
def generate_scenario_for_system(system_metrics, industry, incident_type):
    prompt = f"""
    Generate a PagerDuty scenario for a {industry} system currently showing:
    - CPU: {system_metrics['cpu']}%
    - Memory: {system_metrics['memory']}%  
    - Error Rate: {system_metrics['error_rate']}%
    
    Create a {incident_type} scenario that starts from these current conditions.
    """
    return llm.generate(prompt)
```

### Scenario Libraries
Build reusable scenario components:

```json
{
  "templates": {
    "database_alerts": {...},
    "api_performance": {...},
    "security_incidents": {...}
  },
  "industry_contexts": {
    "finance": {...},
    "healthcare": {...},
    "gaming": {...}
  }
}
```

This comprehensive guide provides everything needed to create realistic PagerDuty event scenarios, either manually or with LLM assistance, ensuring they accurately reflect real-world monitoring and incident response patterns.