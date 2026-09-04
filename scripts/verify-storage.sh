#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

# -----------------------------------------------------------------------------
# Load Environment Configuration
# -----------------------------------------------------------------------------
load_env_file() {
  local env_file="$1"
  if [[ -f "$env_file" ]]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="$(echo "$line" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
      if [[ -z "$line" || "$line" =~ ^# ]]; then
        continue
      fi
      local key="${line%%=*}"
      local val="${line#*=}"
      val="${val%\"}"
      val="${val#\"}"
      val="${val%\'}"
      val="${val#\'}"
      if [[ -n "$key" && -z "${!key:-}" ]]; then
        export "$key"="$val"
      fi
    done < "$env_file"
  fi
}

# If S3_ENDPOINT is not set in environment, load from app/.env.local or app/.env
if [[ -z "${S3_ENDPOINT:-}" ]]; then
  load_env_file "$root/app/.env.local"
  load_env_file "$root/app/.env"
fi

RAW_ENDPOINT="${S3_ENDPOINT:-http://127.0.0.1:9000}"
REGION="${S3_REGION:-us-east-1}"
ACCESS_KEY="${S3_ACCESS_KEY:-minioadmin}"
SECRET_KEY="${S3_SECRET_KEY:-minioadmin}"
LEGACY_BUCKET="${S3_BUCKET:-music}"
PUBLIC_BUCKET="${S3_PUBLIC_BUCKET:-$LEGACY_BUCKET}"
PRIVATE_BUCKET="${S3_PRIVATE_BUCKET:-$LEGACY_BUCKET}"
FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-}"
PUBLIC_URL="${S3_PUBLIC_URL:-}"

# -----------------------------------------------------------------------------
# Endpoint Normalization & Validation
# -----------------------------------------------------------------------------
ENDPOINT="$RAW_ENDPOINT"
NORM_NOTE=""
if [[ -n "$ENDPOINT" && ! "$ENDPOINT" =~ ^https?:// ]]; then
  ENDPOINT="https://$ENDPOINT"
  NORM_NOTE=" (auto-prefixed from '$RAW_ENDPOINT')"
fi

if [[ -z "$FORCE_PATH_STYLE" ]]; then
  if [[ "$ENDPOINT" =~ (127\.0\.0\.1|localhost) ]]; then
    FORCE_PATH_STYLE="true"
  else
    FORCE_PATH_STYLE="false"
  fi
fi

# Export normalized variables for Node helper
export S3_ENDPOINT="$ENDPOINT"
export S3_REGION="$REGION"
export S3_ACCESS_KEY="$ACCESS_KEY"
export S3_SECRET_KEY="$SECRET_KEY"
export S3_PUBLIC_BUCKET="$PUBLIC_BUCKET"
export S3_PRIVATE_BUCKET="$PRIVATE_BUCKET"
export S3_FORCE_PATH_STYLE="$FORCE_PATH_STYLE"
export NODE_PATH="$root/app/node_modules"

echo "=================================================================="
echo "Miguel's Marketplace: Object Storage Verification"
echo "=================================================================="
echo "Endpoint:           $ENDPOINT$NORM_NOTE"
echo "Region:             $REGION"
echo "Public Bucket:      $PUBLIC_BUCKET"
echo "Private Bucket:     $PRIVATE_BUCKET"
echo "Force Path Style:   $FORCE_PATH_STYLE"
if [[ -n "$PUBLIC_URL" ]]; then
  echo "Public URL Base:    $PUBLIC_URL"
fi
echo "=================================================================="

# Region mismatch detection for Backblaze B2 endpoints
inferred_b2_region="$(echo "$ENDPOINT" | sed -nE 's/.*s3\.([a-zA-Z0-9_-]+)\.backblazeb2\.com.*/\1/p')"
if [[ -n "$inferred_b2_region" && "$REGION" != "$inferred_b2_region" ]]; then
  echo ""
  echo "⚠️  CONFIGURATION WARNING: Region Mismatch Detected!"
  echo "   Your S3_ENDPOINT indicates Backblaze region: '$inferred_b2_region'"
  echo "   Your S3_REGION is currently configured as:  '$REGION'"
  echo "   Backblaze S3 API requires S3_REGION to match '$inferred_b2_region'."
  echo "   Please set 'S3_REGION=$inferred_b2_region' in app/.env.local and app/cli/.env."
  echo "------------------------------------------------------------------"
fi

# Determine URLs for probe objects
if [[ -n "$PUBLIC_URL" ]]; then
  PUBLIC_PROBE_URL="${PUBLIC_URL%/}/stream/.verify-probe.mp3"
elif [[ "$FORCE_PATH_STYLE" == "true" ]]; then
  PUBLIC_PROBE_URL="${ENDPOINT%/}/${PUBLIC_BUCKET}/stream/.verify-probe.mp3"
else
  proto="${ENDPOINT%%://*}"
  host="${ENDPOINT#*://}"
  PUBLIC_PROBE_URL="${proto}://${PUBLIC_BUCKET}.${host%/}/stream/.verify-probe.mp3"
fi

if [[ "$FORCE_PATH_STYLE" == "true" ]]; then
  PRIVATE_PROBE_URL="${ENDPOINT%/}/${PRIVATE_BUCKET}/download/.verify-probe.wav"
else
  proto="${ENDPOINT%%://*}"
  host="${ENDPOINT#*://}"
  PRIVATE_PROBE_URL="${proto}://${PRIVATE_BUCKET}.${host%/}/download/.verify-probe.wav"
fi

# -----------------------------------------------------------------------------
# Node Helper Invoker
# -----------------------------------------------------------------------------
run_s3_node() {
  local action="$1"
  node - "$action" <<'EOF'
const { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const endpoint = process.env.S3_ENDPOINT;
const region = process.env.S3_REGION || 'us-east-1';
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
const accessKey = process.env.S3_ACCESS_KEY || '';
const secretKey = process.env.S3_SECRET_KEY || '';
const pubBucket = process.env.S3_PUBLIC_BUCKET;
const privBucket = process.env.S3_PRIVATE_BUCKET;

const s3 = new S3Client({
  region,
  endpoint,
  forcePathStyle,
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
  },
});

const action = process.argv[2];

async function main() {
  if (action === 'upload') {
    try {
      await s3.send(new PutObjectCommand({
        Bucket: pubBucket,
        Key: 'stream/.verify-probe.mp3',
        Body: Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'),
        ContentType: 'audio/mpeg',
      }));
    } catch (err) {
      err.__targetBucket = pubBucket;
      err.__targetKey = 'stream/.verify-probe.mp3';
      throw err;
    }

    try {
      await s3.send(new PutObjectCommand({
        Bucket: privBucket,
        Key: 'download/.verify-probe.wav',
        Body: Buffer.from('download_master_secret_audio_data_0123456789abcdef0123456789abcdef'),
        ContentType: 'audio/wav',
      }));
    } catch (err) {
      err.__targetBucket = privBucket;
      err.__targetKey = 'download/.verify-probe.wav';
      throw err;
    }
  } else if (action === 'presign') {
    const command = new GetObjectCommand({
      Bucket: privBucket,
      Key: 'download/.verify-probe.wav',
      ResponseContentDisposition: 'attachment; filename="verify-probe.wav"',
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    process.stdout.write(url);
  } else if (action === 'presign-stream') {
    const command = new GetObjectCommand({
      Bucket: pubBucket,
      Key: 'stream/.verify-probe.mp3',
    });
    const url = await getSignedUrl(s3, command, { expiresIn: 300 });
    process.stdout.write(url);
  } else if (action === 'cleanup') {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: pubBucket, Key: 'stream/.verify-probe.mp3' }));
    } catch {}
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: privBucket, Key: 'download/.verify-probe.wav' }));
    } catch {}
  }
}

main().catch(err => {
  console.error("\n❌ S3 Operation Failed!");
  console.error("  Error Name:    ", err.name || 'Error');
  console.error("  Error Message: ", err.message);
  if (err.__targetBucket) {
    console.error("  Target Bucket: ", err.__targetBucket);
    console.error("  Target Key:    ", err.__targetKey);
  }
  if (err.$metadata) {
    console.error("  HTTP Status:   ", err.$metadata.httpStatusCode);
    if (err.$metadata.requestId) {
      console.error("  Request ID:    ", err.$metadata.requestId);
    }
  }

  console.error("\n📋 Diagnostic & Troubleshooting Guidance:");
  if (err.name === 'AuthorizationHeaderMalformed' || (err.message && err.message.includes('expecting'))) {
    console.error("  👉 REGION MISMATCH:");
    console.error("     The region provided in S3_REGION does not match your Backblaze cluster region.");
    console.error("     If your endpoint is 'https://s3.us-east-005.backblazeb2.com', set S3_REGION=us-east-005.");
  } else if (err.name === 'InvalidAccessKeyId') {
    console.error("  👉 INVALID ACCESS KEY:");
    console.error("     The S3_ACCESS_KEY does not exist in Backblaze.");
    console.error("     Ensure S3_ACCESS_KEY matches your Backblaze 'keyID' (typically starts with '005...').");
  } else if (err.name === 'SignatureDoesNotMatch') {
    console.error("  👉 INVALID SECRET KEY:");
    console.error("     The S3_SECRET_KEY failed cryptographic signature verification.");
    console.error("     Ensure S3_SECRET_KEY matches your Backblaze 'applicationKey'.");
  } else if (err.name === 'NoSuchBucket') {
    console.error("  👉 BUCKET NOT FOUND:");
    console.error(`     The bucket '${err.__targetBucket}' was not found in your Backblaze account.`);
    console.error("     Check spelling of S3_PUBLIC_BUCKET and S3_PRIVATE_BUCKET in app/.env.local.");
  } else if (err.name === 'AccessDenied') {
    console.error("  👉 ACCESS DENIED:");
    console.error("     Your Backblaze Application Key lacks permission to write to this bucket.");
    console.error("     When creating an Application Key in Backblaze, select 'Read and Write' permissions.");
  } else if (err.code === 'ENOTFOUND' || (err.message && err.message.includes('getaddrinfo'))) {
    console.error("  👉 DNS RESOLUTION FAILED:");
    console.error(`     Could not resolve hostname '${endpoint}'. Check internet connection and URL spelling.`);
  } else if (err.code === 'ECONNREFUSED') {
    console.error("  👉 CONNECTION REFUSED:");
    console.error(`     The server at '${endpoint}' refused the connection. Ensure the service is running.`);
  }

  process.exit(1);
});
EOF
}

cleanup() {
  echo ""
  echo "Cleaning up probe objects..."
  run_s3_node cleanup >/dev/null 2>&1 || true
}
trap cleanup EXIT

# -----------------------------------------------------------------------------
# Step 1: Connectivity Check
# -----------------------------------------------------------------------------
echo ""
echo "[1/5] Checking S3 endpoint connectivity ($ENDPOINT)..."
curl_err_file="$(mktemp)"
endpoint_code="$(curl -sS -o /dev/null -w "%{http_code}" "$ENDPOINT" 2>"$curl_err_file" || true)"
curl_err="$(cat "$curl_err_file" 2>/dev/null || true)"
rm -f "$curl_err_file"

if [[ "$endpoint_code" == "000" || -z "$endpoint_code" ]]; then
  echo "❌ FAIL: Cannot connect to S3_ENDPOINT at $ENDPOINT"
  echo ""
  echo "📋 Diagnostics:"
  if [[ -n "$curl_err" ]]; then
    echo "  Curl output: $curl_err"
  fi
  if [[ "$RAW_ENDPOINT" != "$ENDPOINT" ]]; then
    echo "  Original input:  '$RAW_ENDPOINT'"
    echo "  Resolved target: '$ENDPOINT'"
  fi
  echo ""
  echo "💡 Troubleshooting Hints:"
  if echo "$curl_err" | grep -qi "Could not resolve host"; then
    echo "  • DNS lookup failed. Verify hostname spelling in S3_ENDPOINT."
  elif echo "$curl_err" | grep -qi "Connection refused"; then
    echo "  • Connection refused. If using MinIO locally, start it with: docker compose up -d minio"
    echo "  • If using Backblaze B2, ensure S3_ENDPOINT starts with 'https://'."
  elif echo "$curl_err" | grep -qi "SSL\|certificate"; then
    echo "  • SSL/TLS certificate verification failed."
  fi
  exit 1
fi
echo "OK: S3 endpoint is reachable (HTTP $endpoint_code)"

# -----------------------------------------------------------------------------
# Upload Verification Probes
# -----------------------------------------------------------------------------
echo ""
echo "Uploading test probes to public and private buckets..."
run_s3_node upload
echo "OK: Probes uploaded successfully"

# -----------------------------------------------------------------------------
# Step 2: CORS Check on Public Bucket
# -----------------------------------------------------------------------------
echo ""
echo "[2/5] Testing CORS preflight on public streaming bucket ($PUBLIC_PROBE_URL)..."
cors_headers="$(curl -s -i -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: Range" \
  "$PUBLIC_PROBE_URL" || true)"

if ! echo "$cors_headers" | grep -iq "access-control-allow-origin"; then
  echo "❌ FAIL: Public bucket missing Access-Control-Allow-Origin header in CORS preflight."
  echo ""
  echo "Headers received from $PUBLIC_PROBE_URL:"
  echo "$cors_headers" | sed 's/^/  /'
  echo ""
  echo "💡 To fix this in Backblaze B2:"
  echo "  1. Open Backblaze B2 Console -> Buckets -> '$PUBLIC_BUCKET' -> Bucket Settings -> CORS Rules."
  echo "  2. Add a rule allowing Origin: '*', Operations: ['s3_read', 's3_head'],"
  echo "     Allowed Headers: ['*'], and Expose Headers: ['Range', 'Content-Range', 'Content-Length', 'Accept-Ranges']."
  exit 1
fi

if ! echo "$cors_headers" | grep -iqE "access-control-allow-headers:.*(range|\*)"; then
  echo "❌ FAIL: Public bucket CORS missing Range header in Access-Control-Allow-Headers."
  echo ""
  echo "Headers received:"
  echo "$cors_headers" | sed 's/^/  /'
  echo ""
  echo "💡 In Backblaze B2, ensure Allowed Headers includes '*' or 'Range'."
  exit 1
fi
echo "OK: CORS preflight allowed Range header and origin"

# -----------------------------------------------------------------------------
# Step 3: Byte-Range Streaming (HTTP 206) Check
# -----------------------------------------------------------------------------
echo ""
echo "[3/5] Testing HTTP 206 Partial Content byte-range streaming..."
range_resp="$(curl -s -i -H "Range: bytes=0-15" "$PUBLIC_PROBE_URL" || true)"
stream_code="$(echo "$range_resp" | grep -oE "HTTP/[12](\.[0-9])? [0-9]{3}" | head -n 1 | awk '{print $2}')"

if [[ "$stream_code" == "206" ]]; then
  if ! echo "$range_resp" | grep -iq "content-range: bytes 0-15/"; then
    echo "❌ FAIL: Missing or invalid Content-Range header in 206 response."
    echo "$range_resp" | grep -i "content-range" || true
    exit 1
  fi
  echo "OK: Anonymous byte-range request succeeded with HTTP 206 Partial Content (Public Bucket mode)"
elif [[ "$stream_code" == "401" || "$stream_code" == "403" ]]; then
  echo "Note: Anonymous access to stream probe is denied (HTTP $stream_code)."
  echo "      Testing with Presigned Streaming URL (100% Private Bucket mode)..."
  presigned_stream_url="$(run_s3_node presign-stream)"
  if [[ -z "$presigned_stream_url" ]]; then
    echo "❌ FAIL: Could not generate presigned stream URL"
    exit 1
  fi
  range_resp="$(curl -s -i -H "Range: bytes=0-15" "$presigned_stream_url" || true)"
  if ! echo "$range_resp" | grep -qE "HTTP/[12](\.[0-9])? 206"; then
    echo "❌ FAIL: Presigned stream expected HTTP 206 Partial Content, got unexpected response:"
    echo "$range_resp" | head -n 10 | sed 's/^/  /'
    exit 1
  fi
  if ! echo "$range_resp" | grep -iq "content-range: bytes 0-15/"; then
    echo "❌ FAIL: Missing or invalid Content-Range header in 206 presigned response."
    echo "$range_resp" | grep -i "content-range" || true
    exit 1
  fi
  echo "OK: Presigned byte-range streaming succeeded with HTTP 206 Partial Content (100% Private Bucket mode)"
else
  echo "❌ FAIL: Expected HTTP 206 Partial Content, got unexpected response:"
  echo "$range_resp" | head -n 10 | sed 's/^/  /'
  exit 1
fi

# -----------------------------------------------------------------------------
# Step 4: Private Bucket Security Check
# -----------------------------------------------------------------------------
echo ""
echo "[4/5] Testing private bucket security (denying anonymous GET)..."
anon_resp_file="$(mktemp)"
anon_code="$(curl -s -w "%{http_code}" -o "$anon_resp_file" "$PRIVATE_PROBE_URL" || true)"
rm -f "$anon_resp_file"

if [[ "$anon_code" != "401" && "$anon_code" != "403" ]]; then
  echo "❌ FAIL: Private bucket '$PRIVATE_BUCKET' allowed anonymous access (HTTP $anon_code)!"
  echo "   Expected HTTP 401 Unauthorized or HTTP 403 Forbidden."
  echo ""
  echo "🚨 SECURITY WARNING:"
  echo "   Your private bucket is publicly readable. In Backblaze B2 Console, open"
  echo "   Bucket Settings for '$PRIVATE_BUCKET' and set 'Files in Bucket Are: Private'."
  exit 1
fi
echo "OK: Anonymous access to private bucket correctly denied (HTTP $anon_code)"

# -----------------------------------------------------------------------------
# Step 5: Presigned URL Download Check
# -----------------------------------------------------------------------------
echo ""
echo "[5/5] Testing presigned URL download from private bucket..."
presigned_url="$(run_s3_node presign)"
if [[ -z "$presigned_url" ]]; then
  echo "❌ FAIL: Failed to generate presigned URL via AWS SDK."
  exit 1
fi

temp_download="$(mktemp)"
presigned_code="$(curl -s -w "%{http_code}" -o "$temp_download" "$presigned_url" || true)"

if [[ "$presigned_code" != "200" ]]; then
  echo "❌ FAIL: Presigned URL download failed (HTTP $presigned_code)"
  if [[ -s "$temp_download" ]]; then
    echo "Response body:"
    cat "$temp_download" | head -n 10 | sed 's/^/  /'
  fi
  rm -f "$temp_download"
  exit 1
fi

if ! grep -q "download_master_secret_audio_data" "$temp_download"; then
  echo "❌ FAIL: Downloaded content does not match probe master content."
  rm -f "$temp_download"
  exit 1
fi
rm -f "$temp_download"
echo "OK: Presigned download succeeded (HTTP 200) with matching content"

echo ""
echo "=================================================================="
echo "🎉 All storage verification checks PASSED successfully!"
echo "=================================================================="
