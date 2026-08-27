# Architecture

At a high level we need some UI that presents playable streams to users. Then we need some backend that powers this functionality. We are going to go with the general frontend, backend architecture. This will help us seperate concerns and manage and maintain features and implementation.

# Technology

Long term we want to choose technology that will be well maintained and easy to work with. All we really need right now is something to build out the frontend and backend, and so I feel that we should go with NextJS.

## Why NextJS

We are a one man team. We don't need seperation of concerns when it comes to building this thing out. To be fair if we abstract too much we'll slow us down for now good benefit.

NextJS provides us what we need:
- supports react for us to build the UI
- natively runs in node as a server 
- it can support OOP design which we will revolve around

If we revolve around a mono repo we can build fast, agents would have everything in one place and we can avoid complexity altogether.

## Data Store 

We have data, and the data is simple:
- storing audio files
- storing download history for each audio files
- metadata about the audio files
- consumer details (i.e. those who install/download we grab their email, contacts, etc...)

I think knowing the above requirements we can benefit from using some relational database. I  would prefer postgres as the flavor of SQL as i'm most familiar with it. I do want to note we are definitely not going to use all features of postgres but I think having those extra features readily available for the future as opposed to having potentially migrate from one flavor to another or even worse if we decide to go with NoSQL and later on we want a relational database, it'd a big pain.

> see db-design.md for how the tables are structured

### Storing Objects

For now the best free tier out there is backblaze. They have an incredibly generous free tier:
- 10GB storage
- free egress
- easy to use

We will enforce protection around download urls. This way we can enforce users to accept terms and conditions before allowing them to download. The general mechanism here is to own a key and that key will control when one can access the blob or not.





