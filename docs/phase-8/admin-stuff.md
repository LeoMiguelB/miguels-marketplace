# Production Storage & CDN Architecture
- Public Streaming & Artwork Bucket: `miguelbbeats`
- Private Master Downloads Bucket: `store-downloads`
- Cloudflare Worker CDN for Zero-Cost Egress: `https://miguels-marketplace-worker.lilpopcorn54321.workers.dev`
- Download Protection: Worker only proxies `/stream/` and `/cover/`; `/download/` is private and gated behind `/api/install` presigned URLs.


# CORS policy Notes

Cross origin resource sharing policy

Essentially it's a browsers way of making sure servers are talking to their allowed list of origins.

If our frontend origin is different from a backends origin then the cross origin policy is checked. This essentially makes the browser asks "hey server is this origin allowed to read data from you?".
