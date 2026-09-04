# TODO:
- need to setup cloudflare to proxy against backblaze for free egress
- need to configure CORS rules on backblaze

# CORS policy Notes

Cross origin resource sharing policy

Essentially it's a browsers way of making sure servers are talking to their allowed list of origins.

If our frontend origin is different from a backends origin then the cross origin policy is checked. This essentially makes the browser asks "hey server is this origin allowed to read data from you?".
