import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_s3 as s3 } from 'aws-cdk-lib';
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class AwsCdkCloudformationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //S3 bucket creation
     const bucket = new s3.Bucket(this, 'FrontEndBucket', {
          versioned: true,
          bucketName: 'aws-icon-frontend-bucket',
        //Can use the below attributes if we only want users to access the site via cloudfront
        //**want to make S3 bucket for security reasons */
         publicReadAccess: false,
         blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
         removalPolicy: cdk.RemovalPolicy.DESTROY,
         autoDeleteObjects: true
      });


      //Creates a cloufront OAI user
      const cloudfrontOAI = new cdk.aws_cloudfront.OriginAccessIdentity(
          this, 'CloudFrontOriginAccessIdentity');

      bucket.addToResourcePolicy(new cdk.aws_iam.PolicyStatement({
          actions: ['s3:GetObject'],
          resources: [bucket.arnForObjects('*')],
          principals: [new cdk.aws_iam.CanonicalUserPrincipal(
              cloudfrontOAI.cloudFrontOriginAccessIdentityS3CanonicalUserId)],
      }));

      const domainName = "acuitylabs.us";
      const zone = cdk.aws_route53.HostedZone.fromLookup(this, 'HostedZone',
          { domainName: domainName });

    //provision a TLS certificate associated with domain name
      const certificate = new cdk.aws_certificatemanager.DnsValidatedCertificate(this,
          'SiteCertificate',
          {
              domainName: domainName,
              hostedZone: zone,
              region: 'us-east-1',
              subjectAlternativeNames: ['*.' + domainName]
          });

    //creates headers that make it so requests use HTTPS
      const responseHeaderPolicy = new cdk.aws_cloudfront.ResponseHeadersPolicy(this, 'SecurityHeadersResponseHeaderPolicy', {
          comment: 'Security headers response header policy',
          securityHeadersBehavior: {
              contentSecurityPolicy: {
                  override: true,
                  contentSecurityPolicy: "default-src 'self'"
              },
              strictTransportSecurity: {
                  override: true,
                  accessControlMaxAge: cdk.Duration.days(2 * 365),
                  includeSubdomains: true,
                  preload: true
              },
              contentTypeOptions: {
                  override: true
              },
              referrerPolicy: {
                  override: true,
                  referrerPolicy: cdk.aws_cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN
              },
              xssProtection: {
                  override: true,
                  protection: true,
                  modeBlock: true
              },
              frameOptions: {
                  override: true,
                  frameOption: cdk.aws_cloudfront.HeadersFrameOption.DENY
              }
          }
      });

      //main cloudfront distribution code
      const cloudfrontDistribution = new cdk.aws_cloudfront.Distribution(this, 'CloudFrontDistribution', {
          certificate: certificate,
          domainNames: ['icon.' + domainName],
          defaultRootObject: 'index.html',
          defaultBehavior: {
              origin: new cdk.aws_cloudfront_origins.S3Origin(bucket, {
                  originAccessIdentity: cloudfrontOAI
              }),
              viewerProtocolPolicy: cdk.aws_cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
              responseHeadersPolicy: responseHeaderPolicy
          },
      });

      
      new cdk.aws_route53.ARecord(this, 'SiteAliasRecord', {
          recordName: 'icon.' + domainName,
          target: cdk.aws_route53.RecordTarget.fromAlias(new cdk.aws_route53_targets.CloudFrontTarget(cloudfrontDistribution)),
          zone
      });

  }
}
