# portfolio
An interesting way to manage my portfolio
## Current implementation with eTrade
    Instead of pull data real time I opted for just downloading the csv file from estrade and parsing it. It updates everything in the portfolio at once which is handy. Doesn't require integration of this application with etrade, which is a trade-off but has better security that way.
## Charts
    Added some simple charts to track what's doing on with the assets. Now I have to practice using them and getting accustomed to taking action on what they are telling me.
## todo
    I need to do upgrades as I hate being on old versions. Recommendation is to do express first, then helmet. Then the rest one by one and resolve issues.
    Package                    Current  Wanted  Latest  Location                                Depended by
    @polygon.io/client-js        7.4.0   7.4.0   8.2.0  node_modules/@polygon.io/client-js      portfolio
    express                     4.22.2  4.22.2   5.2.1  node_modules/express                    portfolio
    express-rate-limit          6.11.2  6.11.2   8.5.2  node_modules/express-rate-limit         portfolio
    helmet                       6.2.0   6.2.0   8.2.0  node_modules/helmet                     portfolio
    winston-daily-rotate-file    4.7.1   4.7.1   5.0.0  node_modules/winston-daily-rotate-file  portfolio
