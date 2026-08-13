# portfolio
An interesting way to manage my portfolio
## Current implementation with eTrade
    Instead of pulling data real time I opted for just downloading the csv file from estrade and parsing it. It updates everything in the portfolio at once which is handy. Doesn't require integration of this application with etrade, which is a trade-off but has better security that way.
## Charts
    Added some simple charts to track what's going on with the assets. Now I have to practice using them and getting accustomed to taking action on what they are telling me.
## TODO
    Done: updated to all latest versions.

## Required API Keys
### get an API key from polygon.io and put it into your environment as POLY_KEY. It is used to pull prices from the end of day the previous day. It logs the pull and won't redo it.
### get an API key from AlphaVantage and put it into your environment as AV_KEY. It is used to calculate:
                - annualDividend: dividendPerShare
                - fcfYield: operatingMargin
                - payoutRatio: payoutRatio
                - roic: roic
                - operatingMargin: operatingMargin

# keeping it clean
- on the startup script it also checks for security vulnerabilities. I remediate them immediately, run tests, do a quick E2E test and then commit the code.
- I run `npm outdated` from time to time and force upgrades to all outdated packages. Test and then commit.
